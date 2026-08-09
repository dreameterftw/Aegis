import json
import hashlib
import io

from flask import Flask, request, jsonify
from androguard.core.bytecodes.apk import APK

app = Flask(__name__)

with open("permission_patterns.json") as f:
    PATTERNS = json.load(f)

with open("cert_database.json") as f:
    raw_certs = json.load(f)
    # Strip the comment key and filter out placeholder values
    LEGIT_CERTS = {
        k: v for k, v in raw_certs.items()
        if not k.startswith("_") and not v.startswith("REPLACE_")
    }


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/analyze", methods=["POST"])
def analyze():
    if "file" not in request.files:
        return jsonify({"error": "no file uploaded"}), 400

    raw = request.files["file"].read()
    if not raw:
        return jsonify({"error": "empty file"}), 400

    try:
        apk = APK(raw)
    except Exception as e:
        return jsonify({"error": f"invalid APK: {str(e)}"}), 400

    # ── Basic metadata ────────────────────────────────────────────────────────
    perms = set(apk.get_permissions())
    package = apk.get_package() or "unknown"
    app_name = apk.get_app_name() or "unknown"
    version_name = apk.get_androidversion_name() or "unknown"
    version_code = apk.get_androidversion_code() or "unknown"
    min_sdk = apk.get_min_sdk_version() or "unknown"
    target_sdk = apk.get_target_sdk_version() or "unknown"

    # ── SHA-256 of the raw APK bytes ─────────────────────────────────────────
    apk_sha256 = hashlib.sha256(raw).hexdigest()

    # ── Permission pattern matching ──────────────────────────────────────────
    matched_patterns = []
    for name, pattern in PATTERNS.items():
        if name == "_comment":
            continue
        required = set(pattern.get("required", []))
        if required.issubset(perms):
            aggravating_hit = [
                p for p in pattern.get("aggravating", []) if p in perms
            ]
            matched_patterns.append({
                "pattern": name,
                "severity": pattern["severity"],
                "aggravating_confirmed": len(aggravating_hit) > 0,
                "aggravating_permissions": aggravating_hit,
                "description": pattern["description"],
            })

    # Sort patterns: critical first, then high, then medium
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    matched_patterns.sort(key=lambda p: severity_order.get(p["severity"], 99))

    # ── Certificate analysis ─────────────────────────────────────────────────
    cert_sha256 = None
    cert_mismatch = False
    cert_issuer = None

    try:
        certs = apk.get_certificates()
        if certs:
            cert = certs[0]
            # androguard returns cert as asn1crypto.x509.Certificate
            cert_sha256 = cert.sha256_fingerprint.replace(":", "").lower()
            try:
                cert_issuer = str(cert.issuer.human_friendly)
            except Exception:
                cert_issuer = None

            # Check if this package is a known legitimate app with wrong cert
            if package in LEGIT_CERTS:
                expected = LEGIT_CERTS[package].lower().replace(":", "")
                cert_mismatch = (cert_sha256 != expected)
    except Exception as e:
        cert_sha256 = None
        cert_mismatch = False

    # ── Dangerous permission flags ───────────────────────────────────────────
    HIGH_RISK_PERMISSIONS = {
        "android.permission.READ_SMS",
        "android.permission.RECEIVE_SMS",
        "android.permission.SEND_SMS",
        "android.permission.BIND_ACCESSIBILITY_SERVICE",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.REQUEST_INSTALL_PACKAGES",
        "android.permission.READ_CALL_LOG",
        "android.permission.PROCESS_OUTGOING_CALLS",
        "android.permission.RECORD_AUDIO",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.MANAGE_EXTERNAL_STORAGE",
        "android.permission.WRITE_SETTINGS",
        "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
    }
    dangerous_permissions = list(perms & HIGH_RISK_PERMISSIONS)

    # ── Overall severity ─────────────────────────────────────────────────────
    if any(p["severity"] == "critical" for p in matched_patterns) or cert_mismatch:
        overall_severity = "critical"
    elif any(p["severity"] == "high" for p in matched_patterns):
        overall_severity = "high"
    elif any(p["severity"] == "medium" for p in matched_patterns) or len(dangerous_permissions) >= 3:
        overall_severity = "medium"
    else:
        overall_severity = "safe"

    return jsonify({
        "package": package,
        "app_name": app_name,
        "version_name": version_name,
        "version_code": version_code,
        "min_sdk": min_sdk,
        "target_sdk": target_sdk,
        "apk_sha256": apk_sha256,
        "permissions": sorted(list(perms)),
        "dangerous_permissions": sorted(dangerous_permissions),
        "matched_patterns": matched_patterns,
        "cert_sha256": cert_sha256,
        "cert_issuer": cert_issuer,
        "cert_mismatch": cert_mismatch,
        "overall_severity": overall_severity,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
