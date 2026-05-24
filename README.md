# مدونة الخليل للتحرير اللغوي
### منصة التحرير الهندسي الذكي للغة العربية

[![Production](https://img.shields.io/badge/Production-Live-brightgreen)](https://edit.alamalholol.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js_16-black)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/Engine-LangGraph-blue)](https://langchain-ai.github.io/langgraph)

> *"مساعدك اللغوي لسبك الأفكار، دمج المسودات، والارتقاء بالمحتوى اللغوي بكفاءة بنائية وزمنية."*

---

## ✨ الميزات الجوهرية

| الميزة | الوصف |
|--------|-------|
| 🧠 **التوجيه المخصص للكاتب** | تحديد النبرة والأسلوب والبنية اللغوية المطلوبة قبل المعالجة |
| 🔀 **دمج المسودات الهجين** | دمج ما يصل إلى 5 مسودات في نص واحد متماسك |
| 🛡️ **الرقيب الدلالي المرن** | وكيل تدقيق مستقل يضمن الاتساق والجودة |
| ⚡ **فحص نبض الجاهزية** | Preflight-Check يضمن كفاءة المعالجة قبل الإطلاق |
| 🔄 **المعالجة الهجينة** | تكامل Gemini + DeepSeek في نظام Multi-Agent |

---

## 🏗️ البنية التقنية

```
ara-editor/
├── backend/                    # FastAPI + LangGraph Engine
│   ├── agent/
│   │   ├── graph.py            # توجيه تدفق العمل الهجين
│   │   ├── helpers.py          # إدارة نماذج الذكاء الاصطناعي
│   │   ├── state.py            # حالة النظام الموحدة
│   │   ├── nodes/              # وكلاء المعالجة المتخصصون
│   │   ├── edges/              # منطق التوجيه بين الوكلاء
│   │   └── prompts/            # قوالب التوجيه المخصصة
│   ├── api/schemas.py          # مخططات الـ API
│   ├── config/settings.py      # إعدادات النظام
│   ├── utils/logger_config.py  # نظام التسجيل
│   ├── main.py                 # نقطة دخول الخادم
│   ├── Dockerfile              # حاوية الإنتاج
│   └── requirements.txt        # المتطلبات
└── frontend/                   # Next.js 16 + Turbopack
    └── src/
        ├── app/
        │   ├── layout.tsx      # SEO + الخطوط
        │   ├── page.tsx        # الصفحة الرئيسية
        │   └── globals.css     # التصميم العالمي
        └── components/
            └── SovereignChat.tsx  # الواجهة الرئيسية
```

---

## 🚀 تشغيل المشروع محلياً

### 1. الخلفية (Backend)
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env         # أضف مفاتيح API
uvicorn main:app --reload --port 8000
```

### 2. الواجهة (Frontend)
```bash
cd frontend
npm install
npm run dev
```

الواجهة ستعمل على: `http://localhost:3000`

---

## ⚙️ متغيرات البيئة المطلوبة

```env
GEMINI_API_KEY=your_gemini_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here
```

---

## 🌐 الإنتاج

المنصة مرفوعة على: **[https://edit.alamalholol.com](https://edit.alamalholol.com)**

---

## 👨‍💻 المؤلف

**Eng. Saeed Ali Alzahrani**
مهندس أنظمة الذكاء الاصطناعي اللغوي
