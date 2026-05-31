# مدونة الخليل للتحرير اللغوي

**منصة التحرير الهندسي الذكي للغة العربية** · الإصدار **v4.7** · آخر تحديث للوثائق: **31 مايو 2026**

[![Production](https://img.shields.io/badge/الإنتاج-يعمل-brightgreen)](https://edit.alamalholol.com)
[![Repository](https://img.shields.io/badge/GitHub-alkhalil__AR-181717?logo=github)](https://github.com/engsaeedali/alkhalil_AR)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-Multi--Agent-blue)](https://langchain-ai.github.io/langgraph)

> مساعدك اللغوي لسبك الأفكار، دمج المسودات، تلخيص الوثائق، وصهر المحاور السبعة — بكفاءة بنائية وزمنية.

---

## نظرة عامة

| الوضع | الغرض | المخرجات |
|-------|--------|----------|
| **تحرير ودمج** | دمج مسودة مرجعية + نصوص رديفة (حتى 5 ملفات) | مخطوطة موحدة + قائمة أفكار ذرية (Delta) |
| **تلخيص دلالي** | استخلاص جوهر الوثيقة | أفكار، كلمات مفتاحية، كشاف رقمي |
| **صهر المحاور** | تجميع فوضى نصية في 7 محاور (يتطلب JSON مرجعي) | بطاقات معرفية + طبقات منهجية/عملية |

المحركات: **Gemini Flash** و **DeepSeek** مع تحويل تلقائي عند نفاد حصة Gemini.

---

## الميزات البارزة (v4.6–v4.7)

- **استخراج PDF عربي محسّن** — PyMuPDF + pypdf، اختيار أفضل مسار حسب كثافة الحروف العربية، تنظيف نص واحد (أداء أسرع).
- **ميقاتان حيّان** — زمن استخراج النص وزمن السبك/التلخيص/الصهر.
- **عدّاد توكنات موحّد** — مدخل/مخرج/استدعاءات LLM مع تقدير عند غياب العداد من المزود.
- **ثيم Oatmeal** — واجهة فاتحة عالية التباين + ثيم داكن سيادي.
- **تصدير موحّد** بعد كل معالجة: نسخ، Markdown (كامل/ملخص)، JSON، HTML، طباعة/PDF، Word (Calibri Light 14، RTL).
- **تشغيل Windows صامت** — `run_AlKhalil.bat` / `stop_AlKhalil.bat` مع سجلات في `logs/`.

---

## البنية التقنية

```
alkhalil_AR/
├── backend/
│   ├── agent/                      # LangGraph — سبك واستخراج
│   ├── processors/
│   │   ├── consolidation_engine.py # صهر v4 + Map-Reduce
│   │   ├── document_processor.py   # DOCX / PDF / نص
│   │   ├── pdf_arabic_cleanup.py
│   │   ├── docx_exporter.py        # Word RTL
│   │   └── summarizer.py
│   ├── utils/                      # token_meter, summary_router, …
│   └── main.py
├── frontend/                       # Next.js 16 + React 19
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
├── scripts/launch_service.ps1
├── run_AlKhalil.bat
├── stop_AlKhalil.bat
└── vercel.json
```

---

## واجهات API الرئيسية

| Method | المسار | الوصف |
|--------|--------|--------|
| `POST` | `/extract-text` | استخراج نص من ملف (PDF/DOCX/…) — ميكانيكي، بلا LLM |
| `POST` | `/preflight-check` | فحص جاهزية المحرك قبل المعالجة |
| `POST` | `/merge-drafts` | سبك ودمج المسودات |
| `POST` | `/summarize` | تلخيص دلالي |
| `POST` | `/consolidate` | صهر المحاور الديناميكي |
| `POST` | `/export/docx` | تصدير Word منسّق |
| `GET` | `/health` | صحة الخدمة + `pdf_ready` |
| `POST` | `/chat` | محادثة لغوية فورية |

التوثيق التفاعلي: `http://127.0.0.1:8000/docs`

---

## التشغيل المحلي

### Windows (موصى به)

```bat
run_AlKhalil.bat
```

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://localhost:3000`
- السجلات: `logs/backend.log` · `logs/frontend.log`

```bat
stop_AlKhalil.bat
```

### يدوياً

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env         # أضف GEMINI_API_KEY و DEEPSEEK_API_KEY
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

> عمليات التلخيص والصهر تتصل بالباكند مباشرة (`:8000`) لتجاوز مهلة بروكسي Next (~30 ثانية).

---

## متغيرات البيئة

**`backend/.env`**

```env
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
```

**`frontend/.env.local`** (اختياري)

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

---

## التصدير

| الصيغة | المحتوى الكامل | الملخص |
|--------|------------------|--------|
| نسخ / Markdown | ✓ | ✓ |
| JSON | ✓ | — |
| HTML فاخر | ✓ | — |
| طباعة / PDF | ✓ | — |
| Word `.docx` | ✓ (يشمل المخطوطة في الدمج) | بطاقات/أفكار |

---

## النشر والروابط

| البيئة | الرابط |
|--------|--------|
| الإنتاج | [edit.alamalholol.com](https://edit.alamalholol.com) |
| Vercel | [alkhalil-ar.vercel.app](https://alkhalil-ar.vercel.app) |
| المستودع | [github.com/engsaeedali/alkhalil_AR](https://github.com/engsaeedali/alkhalil_AR) |

```bash
git push origin main
```

يرتبط المستودع بـ Vercel؛ كل دفع إلى `main` يطلق بناءً جديداً.

---

## سجل التحديثات (الوثائق)

| التاريخ | ملخص |
|---------|------|
| **2026-05-31** | README v4.7 — API، أوضاع التشغيل، تصدير، PDF، ثيم Oatmeal |
| 2026-05-30 | واجهة v4.6، شريط تصدير موحّد، تحسين PDF وWord |
| 2026-05 | صهر المحاور v4، عدّاد توكنات، حصانة LangGraph |

---

## المؤلف

**المهندس سعيد علي الزهراني**  
مهندس أنظمة الذكاء الاصطناعي اللغوي
