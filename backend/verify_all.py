import urllib.request
import json
import sys
import time

def test_query(label, prompt):
    print(f"\n==========================================")
    print(f"TEST: {label} ('{prompt}')")
    t0 = time.time()
    payload = {"course_id": 3, "message": prompt}
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/study/ask-tutor",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode("utf-8"))
        dur = time.time() - t0
        print(f"Status: OK ({dur:.2f}s)")
        print(f"Top Video ID: {data.get('top_video_id')}")
        print(f"Top Timestamp: {data.get('top_timestamp_formatted')}")
        print(f"Target Material: {data.get('target_material_title')} (ID: {data.get('target_material_id')})")
        print(f"Matched Videos Count: {len(data.get('matched_videos', []))}")
        for v in data.get('matched_videos', [])[:2]:
            sys.stdout.buffer.write(f"  - [{v.get('timestamp_formatted')}] {v.get('video_id')} | {v.get('video_title')}\n".encode('utf-8'))
        print(f"Answer Preview:\n{data.get('answer', '')[:350]}...\n")
        return True
    except Exception as e:
        print(f"FAILED: {e}")
        return False

test_query("1. IVT (Intermediate Value Theorem)", "bana ivt anlat")
test_query("2. Sandwich Theorem", "sandwich theorem nedir")
