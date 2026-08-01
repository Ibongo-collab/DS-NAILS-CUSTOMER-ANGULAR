/**
 * Vide la file d'attente des notifications.
 *
 * Déploiement :
 *   supabase functions deploy send-notifications
 *
 * Cette fonction est la SEULE à détenir les identifiants du fournisseur : ils
 * ne doivent jamais descendre dans le navigateur, où toute clé est publique.
 *
 * Sans identifiants WhatsApp configurés, elle bascule en mode simulation :
 * les messages sont mis à l'état « simulated » avec leur contenu exact. Rien
 * n'est envoyé, rien n'est perdu — il suffira de poser les secrets pour que
 * les envois réels démarrent.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// À poser le jour où le numéro dédié est disponible :
//   supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_ID=...
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN');
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID');
const WHATSAPP_TEMPLATE = Deno.env.get('WHATSAPP_TEMPLATE') ?? '';

/** Nombre de messages traités par exécution, pour borner la durée. */
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 3;

interface QueuedNotification {
  id: string;
  recipient: string | null;
  message: string;
  attempts: number;
}

type SendResult = { status: 'sent' | 'failed' | 'simulated'; error?: string };

/**
 * Met le numéro au format attendu par WhatsApp : chiffres uniquement, indicatif
 * pays compris, sans « + » ni espaces. Les numéros saisis dans l'application
 * arrivent sous des formes variées (« +242 066671384 »).
 */
function toWhatsAppNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  // Un numéro international plausible fait au moins 8 chiffres avec l'indicatif
  return digits.length >= 8 ? digits : null;
}

const providerConfigured = Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_ID);

async function send(notification: QueuedNotification): Promise<SendResult> {
  const number = notification.recipient ? toWhatsAppNumber(notification.recipient) : null;

  if (!number) {
    return { status: 'failed', error: 'Numéro absent ou inexploitable' };
  }

  // --- Mode simulation : aucun fournisseur configuré ---
  if (!providerConfigured) {
    console.log(`[simulation] → ${number} : ${notification.message}`);
    return { status: 'simulated' };
  }

  // --- Envoi réel via l'API WhatsApp Cloud de Meta ---
  const body = WHATSAPP_TEMPLATE
    ? {
        // Hors fenêtre de service de 24 h, seul un gabarit validé passe
        messaging_product: 'whatsapp',
        to: number,
        type: 'template',
        template: {
          name: WHATSAPP_TEMPLATE,
          language: { code: 'fr' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: notification.message }] }
          ]
        }
      }
    : {
        // Message libre : valable uniquement dans une fenêtre de 24 h ouverte
        // par le destinataire
        messaging_product: 'whatsapp',
        to: number,
        type: 'text',
        text: { body: notification.message }
      };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return { status: 'failed', error: `HTTP ${response.status} — ${detail.slice(0, 300)}` };
    }

    return { status: 'sent' };
  } catch (error) {
    return { status: 'failed', error: String(error).slice(0, 300) };
  }
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('notification_log')
    .select('id, recipient, message, attempts')
    .eq('status', 'queued')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error('Lecture de la file impossible :', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const queue = (data ?? []) as QueuedNotification[];
  const tally = { sent: 0, failed: 0, simulated: 0 };

  for (const notification of queue) {
    const result = await send(notification);
    tally[result.status] += 1;

    await supabase
      .from('notification_log')
      .update({
        // Un échec repasse en file tant que le quota de tentatives n'est pas
        // épuisé : une panne réseau passagère ne doit pas perdre le message.
        status:
          result.status === 'failed' && notification.attempts + 1 < MAX_ATTEMPTS
            ? 'queued'
            : result.status,
        error: result.error ?? null,
        attempts: notification.attempts + 1,
        processed_at: new Date().toISOString()
      })
      .eq('id', notification.id);
  }

  return new Response(
    JSON.stringify({ traites: queue.length, mode: providerConfigured ? 'envoi' : 'simulation', ...tally }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
