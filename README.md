# مدونة الخليل للتحرير اللغوي
### منصة التحرير الهندسي الذكي للغة العربية — v4.6 SaaS

[![Production](https://img.shields.io/badge/Production-Live-brightgreen)](https://edit.alamalholol.com)
[![GitHub](https://img.shields.io/badge/GitHub-alkhalil__AR-181717)](https://github.com/engsaeedali/alkhalil_AR)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js_16-black)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/Engine-LangGraph-blue)](https://langchain-ai.github.io/langgraph)

> *"مساعدك اللغوي لسبك الأفكار، دمج المسودات، والارتقاء بالمحتوى اللغوي بكفاءة بنائية وزمنية."*

---

## ✨ الميزات الجوهرية

| الميزة | الوصف |
|--------|-------|
| 📝 **التلخيص الدلالي** | استخلاص الأفكار الجوهرية، الكلمات المفتاحية، والكشاف الرقمي |
| 🔀 **دمج المسودات** | دمج المسودة المرجعية مع نصوص رديفة (حتى 5 ملفات) في مخطوطة موحدة |
| 🔥 **صهر المحاور v4** | تجميع الفوضى النصية في بطاقات معرفية (7 محاور) مع تدقيق وMap-Reduce |
| 🧠 **التوجيه المخصص** | نبرة، أسلوب، ونية تحريرية قبل المعالجة |
| 🛡️ **الرقيب الدلالي** | تدقيق مستقل وإرشادات تحريرية في مخرجات الصهر |
| ⚡ **فحص الجاهزية** | Preflight قبل إطلاق السبك أو التلخيص |
| 🔄 **محركات هجينة** | Gemini + DeepSeek مع تحويل تلقائي عند نفاد الحصة |
| 📄 **استخراج PDF عربي** | PyMuPDF / pypdf مع تنظيف ودمج أفضل مسار للنص العربي |
| 📤 **تصدير موحّد** | نسخ، Markdown (كامل/ملخص)، JSON، HTML فاخر، طباعة/PDF، Word |
| 🎨 **ثيم Oatmeal** | واجهة فاتحة عالية التباين + ثيم داكن سيادي |

---

## 🏗️ البنية التقنية

```
alkhalil_AR/
├── backend/
│   ├── agent/                  # LangGraph — وكلاء السبك والاستخراج
│   ├── processors/
│   │   ├── consolidation_engine.py
│   │   ├── document_processor.py
│   │   ├── pdf_arabic_cleanup.py
│   │   └── docx_exporter.py
│   ├── utils/                  # token_meter، summary_router، …
│   └── main.py                 # FastAPI — /chat، /summarize، /consolidate، /export/docx
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── SovereignChat.tsx
│       │   ├── MainTextWorkbench.tsx
│       │   ├── ExportActionBar.tsx
│       │   └── ThemeProvider.tsx
│       └── lib/
│           ├── themeClasses.ts
│           ├── exportOutputs.ts
│           └── luxuryExportHtml.ts
├── scripts/launch_service.ps1  # تشغيل خلفي مع سجلات
├── run_AlKhalil.bat            # تشغيل المنصة (Windows)
├── stop_AlKhalil.bat           # إيقاف الخدمات
└── vercel.json                 # نشر Frontend + Backend على Vercel
```

---

## 🚀 تشغيل المشروع محلياً

### الطريقة السريعة (Windows)

```bat
run_AlKhalil.bat    REM يشغّل الباكند (8000) والواجهة (3000) في الخلفية
stop_AlKhalil.bat   REM إيقاف العمليات على المنافذ
```

السجلات: `logs/backend.log` و `logs/frontend.log`

### يدوياً

**1. الخلفية (Backend)**

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # Linux / macOS
pip install -r requirements.txt
copy .env.example .env       # Windows — أضف مفاتيح API
uvicorn main:app --reload --port 8000
```

**2. الواجهة (Frontend)**

```bash
cd frontend
npm install
npm run dev
```

- الواجهة: [http://localhost:3000](http://localhost:3000)
- API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- فحص الصحة: `GET /health` (يتضمن `pdf_ready` عند تثبيت مكتبات PDF)

> للعمليات الطويلة (تلخيص/صهر)، الواجهة تتصل مباشرة بالباكند على المنفذ 8000 لتجاوز حدود بروكسي Next.

---

## ⚙️ متغيرات البيئة

في `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here
```

اختياري في الواجهة (`frontend/.env.local`):

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

---

## 📤 التصدير بعد المعالجة

في جميع الأوضاع (دمج، تلخيص، صهر) يظهر شريط تصدير يدعم:

| الصيغة | المحتوى |
|--------|---------|
| نسخ / Markdown | **كامل** (المخطوطة أو كل البطاقات) أو **ملخص** |
| JSON | هيكل المخرجات الكامل |
| HTML | تقرير منسّق (يثيم الواجهة الحالي) |
| طباعة / PDF | من نافذة HTML |
| Word (.docx) | Calibri Light 14، RTL — مع المخطوطة الكاملة في وضع الدمج |

---

## 🌐 الإنتاج والمستودع

| البيئة | الرابط |
|--------|--------|
| الإنتاج | [https://edit.alamalholol.com](https://edit.alamalholol.com) |
| Vercel | [https://alkhalil-ar.vercel.app](https://alkhalil-ar.vercel.app) |
| GitHub | [https://github.com/engsaeedali/alkhalil_AR](https://github.com/engsaeedali/alkhalil_AR) |

النشر: ربط المستودع بـ Vercel؛ أي `git push` على `main` يطلق بناءً جديداً.

```bash
git push origin main
```

---

## 👨‍💻 المؤلف

**Eng. Saeed Ali Alzahrani**  
مهندس أنظمة الذكاء الاصطناعي اللغوي
