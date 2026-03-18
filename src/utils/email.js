// src/utils/email.js
// Envoi automatique via l'API Brevo (ex-Sendinblue) — gratuit 300 mails/jour
// Fallback : EmailJS (gratuit 200 mails/mois) si Brevo non configuré

import {
  formatTime,
  formatDateFr,
  formatDuration,
  computeSummary,
} from './storage';

// ─── Construction du corps du mail ──────────────────────────────────

function buildEmailBody(dateStr, timings, employeeName) {
  const dateFr = formatDateFr(dateStr);
  const summary = computeSummary(timings);

  const {
    arrival, departure,
    coffeeMornStart, coffeeMornEnd,
    lunchStart, lunchEnd,
    coffeeAftnStart, coffeeAftnEnd,
  } = timings;

  const coffeeMornLine = coffeeMornStart
    ? `☕ Pause café matin      : ${formatTime(coffeeMornStart)} → ${formatTime(coffeeMornEnd)} (${formatDuration(summary.coffeeMorn)})`
    : `☕ Pause café matin      : —`;

  const lunchLine = lunchStart
    ? `🍽️  Déjeuner              : ${formatTime(lunchStart)} → ${formatTime(lunchEnd)} (${formatDuration(summary.lunch)})`
    : `🍽️  Déjeuner              : —`;

  const coffeeAftnLine = coffeeAftnStart
    ? `☕ Pause café après-midi : ${formatTime(coffeeAftnStart)} → ${formatTime(coffeeAftnEnd)} (${formatDuration(summary.coffeeAftn)})`
    : `☕ Pause café après-midi : —`;

  return `Bonjour,

Voici mon récapitulatif de pointage pour le ${dateFr} :

🕐 Arrivée               : ${formatTime(arrival)}
${coffeeMornLine}
${lunchLine}
${coffeeAftnLine}
🚪 Départ                : ${formatTime(departure)}

⏱️  Temps de travail effectif : ${formatDuration(summary.effectiveWork)}
📊 Temps de pauses total      : ${formatDuration(summary.totalPauses)}

Cordialement,
${employeeName}`;
}

// ─── Envoi via Brevo (API v3) ────────────────────────────────────────
// Créez un compte sur brevo.com → Settings → API Keys → créez une clé gratuite
// Collez la clé dans les Paramètres de l'app

async function sendViaBrevo({ apiKey, from, fromName, to, subject, text }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender:   { email: from, name: fromName || 'Pointage Pro' },
      to:       [{ email: to }],
      subject,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erreur Brevo HTTP ${res.status}`);
  }
  return true;
}

// ─── Envoi via EmailJS (fallback gratuit 200/mois) ───────────────────
// Créez un compte sur emailjs.com → Email Services → connectez Gmail/Outlook
// Notez : serviceId, templateId, publicKey

async function sendViaEmailJS({ serviceId, templateId, publicKey, params }) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:  serviceId,
      template_id: templateId,
      user_id:     publicKey,
      template_params: params,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Erreur EmailJS HTTP ${res.status}`);
  }
  return true;
}

// ─── Fonction principale exportée ────────────────────────────────────

export async function sendTimingEmail({ dateStr, timings, settings }) {
  const {
    employeeName,
    recipientEmail,
    senderEmail,
    emailService,   // 'brevo' | 'emailjs'
    brevoApiKey,
    emailjsServiceId,
    emailjsTemplateId,
    emailjsPublicKey,
  } = settings;

  if (!employeeName || !recipientEmail) {
    return {
      success: false,
      error: "Veuillez configurer votre nom et l'email du destinataire dans les Paramètres.",
    };
  }

  const dateFr  = formatDateFr(dateStr);
  const subject = `Pointage du ${dateFr} — ${employeeName}`;
  const body    = buildEmailBody(dateStr, timings, employeeName);

  try {
    if (emailService === 'brevo') {
      // ── Brevo ──────────────────────────────────────────────────
      if (!brevoApiKey) {
        return { success: false, error: "Clé API Brevo manquante. Configurez-la dans les Paramètres." };
      }
      await sendViaBrevo({
        apiKey:   brevoApiKey,
        from:     senderEmail || 'noreply@pointagepro.app',
        fromName: employeeName,
        to:       recipientEmail,
        subject,
        text:     body,
      });

    } else if (emailService === 'emailjs') {
      // ── EmailJS ────────────────────────────────────────────────
      if (!emailjsServiceId || !emailjsTemplateId || !emailjsPublicKey) {
        return { success: false, error: "Paramètres EmailJS incomplets. Vérifiez les Paramètres." };
      }
      await sendViaEmailJS({
        serviceId:  emailjsServiceId,
        templateId: emailjsTemplateId,
        publicKey:  emailjsPublicKey,
        params: {
          to_email:      recipientEmail,
          from_name:     employeeName,
          subject,
          message:       body,
          date:          dateFr,
        },
      });

    } else {
      return {
        success: false,
        error: "Aucun service d'email configuré. Allez dans ⚙️ Paramètres → Service mail.",
      };
    }

    return { success: true };

  } catch (err) {
    return { success: false, error: err.message || "Erreur inconnue lors de l'envoi." };
  }
}
