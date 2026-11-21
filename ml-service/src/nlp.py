"""Tiny hand-written Hinglish intent set (5 intents). Expand with consented real messages before relying on it."""
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

TRAIN = {
 "request_loan": ["mujhe 5000 ka loan chahiye", "loan chahiye 10000", "i need a loan of 3000", "mujhe paise udhaar chahiye", "loan apply karna hai", "2k ka loan milega kya", "mujhe loan lena hai", "need loan urgently"],
 "check_trust_score": ["mera trust score kya hai", "meri credit score dikhao", "show my trust score", "mera score batao", "trust score check karna hai", "what is my score", "mera risk score kitna hai", "score dikha do"],
 "why_score_low": ["mera trust score kam kyun hai", "score low kyu hai", "why is my score low", "mera score kam kyu aaya", "score kaise badhega", "how to improve my score", "trust score kyun gira", "mera score itna kam kyun"],
 "payout_turn": ["meri payout ki baari kab aayegi", "mera number kab aayega", "when is my payout", "payout kab milega", "meri turn kab hai", "mujhe paisa kab milega", "next payout kiski hai", "kab milegi meri baari"],
 "my_contribution": ["maine kitna contribution diya hai", "mera contribution kitna hua", "how much have i contributed", "maine kitna jama kiya", "meri total jama rashi", "mera contribution dikhao", "kitne paise diye maine", "show my contributions"],
}
HELDOUT = [("loan mil sakta hai kya 7000 ka", "request_loan"), ("mujhe 15k udhaar chahiye", "request_loan"), ("trust score batao please", "check_trust_score"),
 ("mera score kitna hai abhi", "check_trust_score"), ("score kyun kam hua", "why_score_low"), ("kaise improve karu apna score", "why_score_low"),
 ("meri baari kab hai", "payout_turn"), ("payout date kab hai", "payout_turn"), ("maine total kitna diya", "my_contribution"), ("my contribution history dikhao", "my_contribution")]

def train_nlp():
    X = [t for v in TRAIN.values() for t in v]; y = [k for k, v in TRAIN.items() for _ in v]
    pipe = make_pipeline(TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5)), LogisticRegression(max_iter=2000, C=10)).fit(X, y)
    acc = sum(pipe.predict([t])[0] == l for t, l in HELDOUT) / len(HELDOUT)
    return pipe, round(acc, 2)

_AMT = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(k|hazaar|hazar|lakh)?", re.I)
def extract_amount(text):
    m = _AMT.search(text)
    if not m: return None
    v = float(m.group(1).replace(",", "")); s = (m.group(2) or "").lower()
    v *= 1000 if s in ("k", "hazaar", "hazar") else 100000 if s == "lakh" else 1
    return int(v) if 0 < v <= 10_000_000 else None
