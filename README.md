# מנהל עבודה בניין - מערכת בחינות

אפליקציית הכנה לבחינות מנהל עבודה בניין.

## הרצה מקומית

```bash
npm install
npm run dev
```

## פרודקשן (Railway)

```bash
npm start
```

הגדרות חשובות כדי שהמידע יישמר לכולם:

- `DATA_FILE=/data/server-data.json` (או כל נתיב על Persistent Volume ב-Railway)
- אם ה-frontend רץ בדומיין אחר מהשרת (למשל Vercel + Railway), יש להגדיר:
  - `VITE_API_BASE_URL=https://<your-railway-domain>`

בלי Persistent Volume הנתונים יימחקו אחרי restart/deploy.

## דפלוי ל-Vercel

אם אתם מעלים Frontend ל-Vercel ואת השרת ל-Railway,
חובה להגדיר ב-Vercel:

- `VITE_API_BASE_URL=https://<your-railway-domain>`

אחרת הקריאות ל-`/api/data` ינסו להגיע ל-Vercel במקום ל-Railway.

## סיסמת מנהל

`
