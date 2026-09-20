# Satellite Revisit Time Calculator

یک ابزار سبک و کاملاً Client-side برای برآورد پنجره‌های دسترسی و **Revisit Time** یک منظومه ماهواره‌ای روی یک نقطه زمینی.

## قابلیت‌ها

- ورودی مختصات هدف (`lat/lon`)
- ارتفاع مدار
- Inclination
- تعداد ماهواره‌ها
- تعداد صفحات مداری
- RAAN اولیه
- Walker-like phasing
- حداکثر زاویه `Off-Nadir`
- مدت و گام زمانی شبیه‌سازی
- محاسبه:
  - Maximum Revisit Time
  - Average Revisit Time
  - تعداد پنجره‌های دسترسی
  - درصد پوشش زمانی
  - دوره مداری
- خروجی CSV از پنجره‌های دسترسی

## اجرای محلی

هیچ نصب خاصی لازم نیست.

1. Repository را دانلود یا clone کنید.
2. فایل `index.html` را در مرورگر باز کنید.

برای جلوگیری از محدودیت‌های احتمالی مرورگر بهتر است با یک web server ساده اجرا شود:

```bash
python -m http.server 8000
```

سپس:

```text
http://localhost:8000
```

## انتشار روی GitHub Pages

1. یک repository جدید در GitHub ایجاد کنید.
2. فایل‌ها را push کنید.
3. وارد `Settings > Pages` شوید.
4. در بخش **Build and deployment** گزینه `Deploy from a branch` را انتخاب کنید.
5. Branch را روی `main` و پوشه را روی `/ (root)` قرار دهید.
6. بعد از چند دقیقه لینک عمومی سایت ساخته می‌شود.

## مدل فعلی

مدل فعلی از این فرض‌ها استفاده می‌کند:

- زمین کروی با شعاع `6378.137 km`
- مدار دایروی
- سرعت زاویه‌ای ثابت ماهواره
- چرخش زمین با نرخ ثابت
- صفحات مداری با RAAN یکنواخت
- توزیع Walker-like فاز ماهواره‌ها
- دسترسی وقتی برقرار است که:
  - نقطه بالای افق هندسی ماهواره باشد
  - زاویه Off-Nadir کمتر یا مساوی مقدار تعیین‌شده باشد

## محدودیت‌ها

این نسخه فعلاً موارد زیر را لحاظ نمی‌کند:

- SGP4 / TLE واقعی
- eccentricity
- J2 perturbation
- atmospheric drag
- sun illumination
- cloud cover
- slew rate و stabilization
- Field of View واقعی سنجنده
- محدودیت‌های tasking و عملیات ماهواره

## Roadmap پیشنهادی

- [ ] SGP4 / TLE support
- [ ] OMM / CSV support
- [ ] J2 perturbation
- [ ] Sun elevation filter
- [ ] Multi-target analysis
- [ ] Walker constellation optimizer
- [ ] Coverage / revisit heatmap
- [ ] Historical TLE analysis

## Disclaimer

این ابزار برای تحلیل اولیه و مهندسی مفهومی است و نباید بدون اعتبارسنجی مستقل برای طراحی عملیاتی یا مأموریت‌های واقعی استفاده شود.
