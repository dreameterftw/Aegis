# Phishing Classifier — ONNX Model Training

## Overview

The on-device ONNX model is a lightweight binary classifier (safe / phishing) trained on URL features. Target: ≤ 50 ms inference on a mid-range Android WebView.

## Feature vector (64-dimensional Float32)

| Index | Feature |
|-------|---------|
| 0 | URL length / 200 |
| 1 | Hostname length / 50 |
| 2 | Path length / 100 |
| 3 | Dot count in hostname / 5 |
| 4 | Hyphen count in hostname / 5 |
| 5 | Is IP address (0/1) |
| 6 | Uses HTTPS (0/1) |
| 7 | Contains @ symbol (0/1) |
| 8 | Double-slash redirect (0/1) |
| 9 | Query string length / 100 |
| 10–25 | Suspicious token presence (login, signin, verify, …) |
| 26–30 | Suspicious TLD (.tk, .ml, .ga, .cf, .gq) |
| 31 | Subdomain depth / 3 |
| 32 | Path depth / 5 |
| 33 | Has port (0/1) |
| 34 | Query param count / 10 |
| 35 | Has fragment (0/1) |
| 36–63 | Reserved (zeros — for future features) |

## Training data

Recommended sources:
- **Positive (phishing):** PhishTank verified feed, OpenPhish, APWG eCrime dataset
- **Negative (safe):** Alexa/Tranco top 1M domains, Cisco Umbrella top domains

Aim for a balanced dataset of ~100k URLs (50k each class).

## Training (Python)

```bash
pip install scikit-learn onnxmltools skl2onnx pandas
python train.py
```

`train.py` outline:
```python
from sklearn.ensemble import GradientBoostingClassifier
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

clf = GradientBoostingClassifier(n_estimators=100, max_depth=4)
clf.fit(X_train, y_train)

initial_type = [('input', FloatTensorType([None, 64]))]
onnx_model = convert_sklearn(clf, initial_types=initial_type)

with open('phishing_classifier.onnx', 'wb') as f:
    f.write(onnx_model.SerializeToString())
```

Copy the output `phishing_classifier.onnx` to `frontend/public/models/`.

## Target metrics
- AUC-ROC ≥ 0.97
- Precision ≥ 0.95 (minimise false positives — better to miss a phish than block legit sites)
- Inference latency ≤ 50 ms on WASM backend
