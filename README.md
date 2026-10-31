# منصة السنتر التعليمي

React + Vite + Supabase. النشر على GitHub Pages تلقائي مع كل push على main.

## تشغيل محلي
    npm install
    npm run dev

## ملاحظات
- المفتاح في الـ workflow هو publishable key (مصمم يبقى علني)، والحماية الفعلية من سياسات RLS في قاعدة البيانات.
- في Supabase > Authentication > URL Configuration ضيف رابط GitHub Pages في Site URL و Redirect URLs.
