import sys
sys.stdout.reconfigure(encoding='utf-8')
from starlette.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_api():
    # 1. Health
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    print("[PASS] Health check:", res.json())

    # 2. Create Course
    res = client.post("/api/courses", json={"name": "Diferansiyel Denklemler", "description": "Matematik 2 Vize & Final"})
    assert res.status_code == 200, f"Create course failed: {res.text}"
    course = res.json()
    course_id = course["id"]
    print("[PASS] Course created:", course)

    # 3. Add Text Note to Course
    note_content = (
        "Euler Yöntemi: Diferansiyel denklemlerin sayısal çözümünde en temel yaklaşımdır. "
        "y_(n+1) = y_n + h * f(x_n, y_n) formülü ile hesaplanır. Burada h adım aralığıdır. "
        "Taylor serisinin ilk iki terimi kullanılarak elde edilir. Yerel kesme hatası O(h^2) mertebesindedir."
    )
    res = client.post("/api/materials/text", json={
        "course_id": course_id,
        "title": "Euler Yöntemi Özeti",
        "content": note_content
    })
    assert res.status_code == 200, f"Add note failed: {res.text}"
    print("[PASS] Note added:", res.json())

    # 4. List Courses
    res = client.get("/api/courses")
    assert res.status_code == 200
    courses = res.json()
    assert len(courses) >= 1
    print(f"[PASS] Courses listed: {len(courses)} courses found")

    # 5. Course Detail
    res = client.get(f"/api/courses/{course_id}")
    assert res.status_code == 200
    detail = res.json()
    assert len(detail["materials"]) >= 1
    print(f"[PASS] Course detail retrieved. Materials: {len(detail['materials'])}")

    # 6. Ask AI Tutor (with offline fallback or Gemini)
    res = client.post("/api/study/ask-tutor", json={
        "course_id": course_id,
        "message": "Euler yöntemi formülü nedir ve h neyi ifade eder?",
        "selected_text": "y_(n+1) = y_n + h * f(x_n, y_n)"
    })
    assert res.status_code == 200, f"Ask tutor failed: {res.text}"
    tutor_reply = res.json()
    print("[PASS] AI Tutor Answered:\n", tutor_reply["answer"][:180] + "...")

    # 7. Generate Quiz
    res = client.post("/api/study/quiz", json={
        "course_id": course_id,
        "topic": "Euler Yöntemi",
        "count": 2
    })
    assert res.status_code == 200, f"Quiz generation failed: {res.text}"
    quiz = res.json()
    print(f"[PASS] Quiz generated with {len(quiz['questions'])} questions.")

    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_api()
