/**
 * verdictTemplates.js — Centralised UI strings for all 6 languages
 *
 * Every screen imports from here instead of hardcoding text per component.
 * AI-generated verdicts (from Groq) are stored in data.verdicts[langCode]
 * and don't need to be here — this file covers static UI labels only.
 */

export const LANGUAGES = {
  en: 'English',
  hi: 'हिन्दी',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  bn: 'বাংলা',
  mr: 'मराठी',
};

export const STATIC_STRINGS = {
  // ── Navigation ──────────────────────────────────────────────────────────────
  tab_scanner:     { en: 'Scanner',    hi: 'स्कैनर',       ta: 'ஸ்கேனர்',         te: 'స్కానర్',        bn: 'স্ক্যানার',    mr: 'स्कॅनर'    },
  tab_linksentry:  { en: 'LinkSentry', hi: 'लिंक जांच',     ta: 'லிங்க் சென்ட்ரி', te: 'లింక్ సెంట్రీ',  bn: 'লিঙ্কসেন্ট্রি', mr: 'लिंक सेंट्री' },
  tab_breach:      { en: 'BreachRadar',hi: 'ब्रीच रडार',   ta: 'மீறல் ரேடார்',    te: 'బ్రీచ్ రాడార్',  bn: 'ব্রিচ রাডার',  mr: 'ब्रीच रडार' },

  // ── Status labels ────────────────────────────────────────────────────────────
  safe_label:      { en: 'SAFE',       hi: 'सुरक्षित',     ta: 'பாதுகாப்பானது',   te: 'సురక్షితం',      bn: 'নিরাপদ',       mr: 'सुरक्षित'  },
  dangerous_label: { en: 'DANGEROUS',  hi: 'खतरनाक',      ta: 'ஆபத்தானது',      te: 'ప్రమాదకరం',     bn: 'বিপজ্জনক',    mr: 'धोकादायक'  },
  suspicious_label:{ en: 'SUSPICIOUS', hi: 'संदिग्ध',      ta: 'சந்தேகமானது',    te: 'అనుమానాస్పదం',  bn: 'সন্দেহজনক',   mr: 'संशयास्पद'  },
  phishing_label:  { en: 'PHISHING',   hi: 'फ़िशिंग',      ta: 'ஃபிஷிங்',        te: 'ఫిషింగ్',        bn: 'ফিশিং',        mr: 'फिशिंग'    },
  breached_label:  { en: 'BREACHED',   hi: 'डेटा लीक',    ta: 'மீறப்பட்டது',    te: 'డేటా లీక్',     bn: 'ডেটা লিক',    mr: 'डेटा लीक'  },
  clean_label:     { en: 'CLEAN',      hi: 'सुरक्षित',     ta: 'பாதுகாப்பானது',   te: 'సురక్షితం',      bn: 'নিরাপদ',       mr: 'सुरक्षित'  },

  // ── Buttons ──────────────────────────────────────────────────────────────────
  scan_btn:        { en: 'Scan',         hi: 'स्कैन करें',    ta: 'ஸ்கேன்',        te: 'స్కాన్',         bn: 'স্ক্যান',      mr: 'स्कॅन करा'  },
  check_btn:       { en: 'Check',        hi: 'जांचें',        ta: 'சரிபார்',       te: 'తనిఖీ చేయి',    bn: 'চেক করুন',    mr: 'तपासा'      },
  report_btn:      { en: 'Report',       hi: 'रिपोर्ट करें', ta: 'புகார் செய்',   te: 'నివేదించు',      bn: 'রিপোর্ট করুন', mr: 'रिपोर्ट करा' },
  share_btn:       { en: 'Share Warning',hi: 'चेतावनी शेयर', ta: 'எச்சரிக்கை பகிர்',te: 'హెచ్చరిక పంచు', bn: 'সতর্কতা শেয়ার', mr: 'चेतावनी शेअर'},
  subscribe_btn:   { en: '🔔 Alert Me', hi: '🔔 सूचना दें', ta: '🔔 அறிவிப்பு',  te: '🔔 అప్రమత్తం',  bn: '🔔 সতর্ক করুন', mr: '🔔 सूचित करा'},

  // ── APK Scanner ──────────────────────────────────────────────────────────────
  apk_title:       { en: 'APK Scanner',  hi: 'APK स्कैनर',   ta: 'APK ஸ்கேனர்',  te: 'APK స్కానర్',   bn: 'APK স্ক্যানার', mr: 'APK स्कॅनर'  },
  apk_subtitle:    { en: 'Drop an APK to check for malware', hi: 'मैलवेयर जांचने के लिए APK डालें',
                     ta: 'தீங்கிழைக்கும் மென்பொருளை சரிபார்க்க APK ஐ பதிவிறக்கவும்',
                     te: 'మాల్వేర్ తనిఖీ చేయడానికి APK అప్‌లోడ్ చేయండి',
                     bn: 'ম্যালওয়্যার পরীক্ষার জন্য APK আপলোড করুন',
                     mr: 'मालवेअर तपासण्यासाठी APK टाका' },
  apk_upload_hint: { en: 'Tap to upload or drag & drop .apk', hi: 'APK अपलोड करें', ta: 'APK பதிவேற்றவும்',
                     te: 'APK అప్‌లోడ్ చేయండి', bn: 'APK আপলোড করুন', mr: 'APK अपलोड करा' },
  trust_score:     { en: 'Trust Score',  hi: 'विश्वास स्कोर', ta: 'நம்பகத்தன்மை', te: 'నమ్మకం స్కోర్',  bn: 'বিশ্বাস স্কোর', mr: 'विश्वास स्कोर'},

  // ── LinkSentry ───────────────────────────────────────────────────────────────
  link_title:      { en: 'LinkSentry',   hi: 'लिंक जांच',   ta: 'இணைப்பு சரிபார்', te: 'లింక్ తనిఖీ',   bn: 'লিঙ্ক যাচাই',  mr: 'लिंक तपासणी' },
  link_placeholder:{ en: 'Paste link here…', hi: 'लिंक यहाँ पेस्ट करें…', ta: 'இணைப்பை இங்கே ஒட்டவும்…',
                     te: 'లింక్ ఇక్కడ పేస్ట్ చేయండి…', bn: 'লিঙ্ক এখানে পেস্ট করুন…', mr: 'लिंक येथे पेस्ट करा…' },
  ai_confidence:   { en: 'AI confidence', hi: 'AI विश्वास', ta: 'AI நம்பகத்தன்மை', te: 'AI నమ్మకం',      bn: 'AI আস্থা',     mr: 'AI विश्वास'  },

  // ── BreachRadar ──────────────────────────────────────────────────────────────
  breach_title:    { en: 'BreachRadar',  hi: 'ब्रीच रडार',  ta: 'மீறல் ரேடார்',  te: 'బ్రీచ్ రాడార్',  bn: 'ব্রিচ রাডার',  mr: 'ब्रीच रडार'  },
  safety_score:    { en: 'Digital Safety Score', hi: 'डिजिटल सुरक्षा स्कोर',
                     ta: 'டிஜிட்டல் பாதுகாப்பு மதிப்பெண்', te: 'డిజిటల్ భద్రతా స్కోర్',
                     bn: 'ডিজিটাল নিরাপত্তা স্কোর', mr: 'डिजिटल सुरक्षा स्कोर' },
  what_to_do:      { en: 'What to do now', hi: 'अभी क्या करें', ta: 'இப்போது என்ன செய்வது',
                     te: 'ఇప్పుడు ఏమి చేయాలి', bn: 'এখন কী করবেন', mr: 'आता काय करावे' },
  no_breach:       { en: 'No breaches found for selected services.', hi: 'चुनी गई सेवाओं में कोई डेटा लीक नहीं मिला।',
                     ta: 'தேர்ந்தெடுக்கப்பட்ட சேவைகளில் மீறல் இல்லை.',
                     te: 'ఎంచుకున్న సేవల్లో ఉల్లంఘన కనుగొనబడలేదు.',
                     bn: 'নির্বাচিত পরিষেবায় কোনো লিক পাওয়া যায়নি।',
                     mr: 'निवडलेल्या सेवांमध्ये कोणताही डेटा उल्लंघन आढळला नाही।' },

  // ── Community / heatmap ──────────────────────────────────────────────────────
  community_reported: { en: '✅ Reported', hi: '✅ रिपोर्ट किया', ta: '✅ புகாரளிக்கப்பட்டது',
                        te: '✅ నివేదించబడింది', bn: '✅ রিপোর্ট করা হয়েছে', mr: '✅ नोंदवले' },
  community_propagated:{ en: '⚠️ Added to blocklist', hi: '⚠️ ब्लॉकलिस्ट में जोड़ा',
                        ta: '⚠️ தடுப்பு பட்டியலில் சேர்க்கப்பட்டது', te: '⚠️ బ్లాక్‌లిస్ట్‌కు జోడించబడింది',
                        bn: '⚠️ ব্লকলিস্টে যোগ করা হয়েছে', mr: '⚠️ ब्लॉकलिस्टमध्ये जोडले' },
  loading:           { en: 'Checking…',  hi: 'जांच रहे हैं…', ta: 'சரிபார்க்கிறோம்…', te: 'తనిఖీ చేస్తున్నాం…', bn: 'যাচাই করা হচ্ছে…', mr: 'तपासत आहोत…' },
};

/**
 * Get a localised string with fallback to English.
 * @param {string} key     Key from STATIC_STRINGS
 * @param {string} lang    Language code e.g. 'hi'
 * @returns {string}
 */
export function s(key, lang = 'en') {
  return STATIC_STRINGS[key]?.[lang] || STATIC_STRINGS[key]?.en || key;
}
