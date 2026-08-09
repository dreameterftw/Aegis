"""
train_classifier.py — Aegis phishing URL classifier training pipeline

Trains a RandomForestClassifier on a 64-dimensional URL feature vector
and exports it as ONNX for in-browser inference via onnxruntime-web.

Usage:
    pip install scikit-learn skl2onnx onnxmltools pandas numpy
    python train_classifier.py

Output:
    phishing_classifier.onnx  → copy to frontend/public/models/

Feature vector (64-dimensional Float32) — must match linkClassifier.js exactly:
    [0]   URL length / 200
    [1]   Hostname length / 50
    [2]   Path length / 100
    [3]   Dot count in hostname / 5
    [4]   Hyphen count in hostname / 5
    [5]   Raw IP as hostname (0/1)
    [6]   Uses HTTPS (0/1)
    [7]   Contains @ (0/1)
    [8]   Double-slash redirect (0/1)
    [9]   Query string length / 100
    [10-25] Suspicious token presence: login, signin, verify, secure, account,
            update, confirm, banking, paypal, amazon, google, apple,
            microsoft, netflix, sbi, hdfc
    [26-30] Suspicious TLD: .tk .ml .ga .cf .gq
    [31]  Subdomain depth / 3
    [32]  Path depth / 5
    [33]  Has non-standard port (0/1)
    [34]  Query param count / 10
    [35]  Has fragment (0/1)
    [36-63] Reserved zeros
"""

import re
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

FEATURE_DIM = 64

SUSPICIOUS_TOKENS = [
    'login', 'signin', 'verify', 'secure', 'account', 'update',
    'confirm', 'banking', 'paypal', 'amazon', 'google', 'apple',
    'microsoft', 'netflix', 'sbi', 'hdfc',
]

SUSPICIOUS_TLDS = ['.tk', '.ml', '.ga', '.cf', '.gq']


def extract_features(url: str) -> list[float]:
    """
    Extract a 64-dimensional feature vector from a URL string.
    Must match the JS extractFeatures() in frontend/src/lib/linkClassifier.js.
    """
    features = [0.0] * FEATURE_DIM

    try:
        with_scheme = url if '://' in url else f'https://{url}'
        parsed = urlparse(with_scheme)
        host = parsed.netloc or ''
        lower = url.lower()

        features[0] = min(len(url) / 200, 1.0)
        features[1] = min(len(host) / 50, 1.0)
        features[2] = min(len(parsed.path) / 100, 1.0)
        features[3] = min(host.count('.') / 5, 1.0)
        features[4] = min(host.count('-') / 5, 1.0)
        features[5] = 1.0 if re.match(r'^\d{1,3}(\.\d{1,3}){3}$', host) else 0.0
        features[6] = 1.0 if parsed.scheme == 'https' else 0.0
        features[7] = 1.0 if '@' in url else 0.0
        features[8] = 1.0 if url.count('//') > 1 else 0.0
        features[9] = min(len(parsed.query) / 100, 1.0)

        for i, token in enumerate(SUSPICIOUS_TOKENS):
            features[10 + i] = 1.0 if token in lower else 0.0

        for i, tld in enumerate(SUSPICIOUS_TLDS):
            features[26 + i] = 1.0 if host.endswith(tld) else 0.0

        subdomain_depth = max(0, len(host.split('.')) - 2)
        features[31] = min(subdomain_depth / 3, 1.0)

        path_depth = len([p for p in parsed.path.split('/') if p])
        features[32] = min(path_depth / 5, 1.0)

        features[33] = 1.0 if parsed.port else 0.0

        param_count = len(parse_qs(parsed.query))
        features[34] = min(param_count / 10, 1.0)

        features[35] = 1.0 if parsed.fragment else 0.0

        # features 36–63: zeros (reserved)

    except Exception:
        pass

    return features


def load_dataset(csv_path: str) -> tuple[np.ndarray, np.ndarray]:
    """
    Load training CSV with columns: url, label (1=phishing, 0=legitimate).

    Recommended data sources:
    - PhishTank verified feed (phishtank.org/developer_info.php)
    - OpenPhish (openphish.com/feed.txt)
    - ISCX-URL-2016 dataset (research.unb.ca/datasets)
    - Tranco top-1M for legitimate URLs (tranco-list.eu)

    Aim for ~100k balanced samples (50k each class).
    """
    df = pd.read_csv(csv_path)
    if 'url' not in df.columns or 'label' not in df.columns:
        raise ValueError("CSV must have 'url' and 'label' columns")

    print(f"Loaded {len(df)} URLs — {df['label'].sum()} phishing, {(df['label']==0).sum()} legitimate")

    X = np.array([extract_features(u) for u in df['url']], dtype=np.float32)
    y = df['label'].values.astype(np.int64)
    return X, y


def train(csv_path: str, output_path: str = 'phishing_classifier.onnx') -> None:
    X, y = load_dataset(csv_path)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print("Training RandomForestClassifier...")
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=8,
        min_samples_leaf=5,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    # ── Evaluation ────────────────────────────────────────────────────────────
    y_pred = clf.predict(X_test)
    y_proba = clf.predict_proba(X_test)[:, 1]

    print("\n── Evaluation ─────────────────────────────────────────────")
    print(classification_report(y_test, y_pred, target_names=['legitimate', 'phishing']))
    print(f"AUC-ROC: {roc_auc_score(y_test, y_proba):.4f}")
    print("────────────────────────────────────────────────────────────\n")

    # Target: AUC-ROC ≥ 0.97, Precision (phishing) ≥ 0.95
    auc = roc_auc_score(y_test, y_proba)
    if auc < 0.95:
        print(f"WARNING: AUC-ROC {auc:.4f} is below the 0.97 target. Consider more training data.")

    # ── ONNX export ───────────────────────────────────────────────────────────
    initial_type = [('input', FloatTensorType([None, FEATURE_DIM]))]
    onnx_model = convert_sklearn(
        clf,
        initial_types=initial_type,
        options={id(clf): {'zipmap': False}},  # output raw arrays, not dicts
    )

    with open(output_path, 'wb') as f:
        f.write(onnx_model.SerializeToString())

    size_kb = Path(output_path).stat().st_size / 1024
    print(f"Model exported to {output_path} ({size_kb:.1f} KB)")
    print(f"\nNext step: copy {output_path} to frontend/public/models/")


if __name__ == '__main__':
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'training_urls.csv'
    train(csv_path)
