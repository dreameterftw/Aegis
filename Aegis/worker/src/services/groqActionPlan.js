/**
 * groqActionPlan.js — Breach-specific Groq action plan generator
 *
 * Uses llama-3.3-70b-versatile (higher quality, low volume — only called
 * once per breach type since results are cached in Firestore).
 *
 * Returns 3 specific, numbered action steps in plain English.
 * The calling handler is responsible for caching the result.
 */

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

/**
 * Generate 3 concrete action steps for a specific breach.
 *
 * @param {object} breach   Breach record from Firestore breach_index
 * @param {object} env      Cloudflare Worker env bindings
 * @returns {Promise<string[]>}  Array of 3 step strings
 */
export async function generateActionPlan(breach, env) {
  if (!env.GROQ_API_KEY) {
    return staticActionPlan(breach);
  }

  const dataTypes = (breach.dataTypesExposed || breach.dataTypes || []).join(', ');
  const orgName = breach.orgName || breach.name || 'Unknown organization';

  const prompt = `A user's personal data was exposed in a real data breach.

Organization: ${orgName}
Data types exposed: ${dataTypes}
Breach date: ${breach.date || 'unknown'}

Give exactly 3 concrete, specific action steps a non-technical Indian user should take right now to protect themselves. Each step must be specific to THIS breach and these data types — not generic advice. For example, if phone was exposed, say "Call your mobile operator to check for unauthorized SIM swap requests." If health data was exposed, say "Check your health insurance claims for unauthorized procedures."

Format: number each step 1. 2. 3. — plain sentences, no markdown, no bullet points. Output only the 3 steps, nothing else.`;

  try {
    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      console.error(`Groq action plan error ${res.status}`);
      return staticActionPlan(breach);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() ?? '';

    // Parse numbered steps — handles "1. step", "1) step", "1 step"
    const steps = raw
      .split(/\n/)
      .map((l) => l.replace(/^[123][.)]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3);

    return steps.length === 3 ? steps : staticActionPlan(breach);
  } catch (err) {
    console.error('Groq action plan exception:', err);
    return staticActionPlan(breach);
  }
}

/**
 * Static fallback action plans keyed by breach type.
 */
function staticActionPlan(breach) {
  const key = breach.actionPlanKey || '';
  const dataTypes = breach.dataTypesExposed || breach.dataTypes || [];

  if (key === 'insurance_data_breach' || dataTypes.includes('health_data')) {
    return [
      'Call your health insurance provider and request a full list of claims made in the past 12 months — flag any you do not recognise.',
      'Ask your insurer to add a verbal password to your policy so no one can modify coverage without your spoken approval.',
      'Monitor your Aadhaar-linked bank accounts for small unexplained deductions which can indicate insurance fraud.',
    ];
  }

  if (key === 'government_portal_breach' || dataTypes.includes('aadhaar_last4')) {
    return [
      'Visit uidai.gov.in and lock your Aadhaar biometrics using the "Lock/Unlock Biometrics" feature to prevent misuse.',
      'Check your Aadhaar authentication history at resident.uidai.gov.in to see if it has been used without your knowledge.',
      'Update your mobile number linked to Aadhaar at the nearest Aadhaar enrolment centre if you suspect it has been changed.',
    ];
  }

  if (key === 'aadhaar_exposure' || dataTypes.includes('aadhaar_number')) {
    return [
      'Immediately lock your Aadhaar biometrics at uidai.gov.in — this prevents anyone from using your Aadhaar for authentication.',
      'Generate a Virtual ID (VID) at uidai.gov.in to use instead of your actual Aadhaar number for KYC purposes going forward.',
      'File a complaint at cybercrime.gov.in if you notice any services opened in your name using your Aadhaar number.',
    ];
  }

  if (dataTypes.includes('phone') && dataTypes.includes('email')) {
    return [
      'Change passwords on all accounts linked to this phone number or email address, starting with banking and UPI apps.',
      'Enable two-factor authentication (2FA) on your Google, email, and banking accounts if not already done.',
      'Watch for unusual OTPs arriving on your phone — contact your bank immediately if you receive OTPs you did not request.',
    ];
  }

  // Generic fallback
  return [
    'Change passwords on all important accounts — banking, email, UPI apps — using a unique password for each.',
    'Enable two-factor authentication on your bank, Google, and email accounts.',
    'Check your bank statements and credit report for any transactions or accounts you do not recognise.',
  ];
}
