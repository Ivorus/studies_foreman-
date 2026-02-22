import { useState, useEffect } from 'react'
import QUESTIONS_RAW from './questions.json'

// ── constants ────────────────────────────────────────────────
const DEFAULT_COLLEGES = [
  'מכללת הבוני - תל אביב',
  'מכללת הבוני - חיפה',
  'מכללת הבוני - ירושלים',
  'מכללת הבוני - באר שבע',
  'מכללת הבוני - נתניה',
  'מכללת הבוני - אשדוד',
]
const ADMIN_PASS = 'admin123'
const EXAM_COUNT = 50
const PASS_SCORE = 35
const LETTERS = ['א', 'ב', 'ג', 'ד']

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function nowStr() {
  return new Date().toLocaleString('he-IL')
}

// ══════════════════════════════════════════════════════════════
//  STORAGE HELPERS
// ══════════════════════════════════════════════════════════════
async function sg(key, shared = false) {
  if (!shared) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  try {
    const res = await fetch(`/api/data/${encodeURIComponent(key)}`)
    if (!res.ok) throw new Error('fetch failed')
    const data = await res.json()
    return data?.value ?? null
  } catch {
    return null
  }
}

async function ss(key, val, shared = false) {
  if (!shared) {
    try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
    return
  }

  try {
    await fetch(`/api/data/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    })
  } catch {}
}

const DEFAULT_LOGIN_CONFIG = {
  title: 'מנהל עבודה בניין',
  subtitle: 'מערכת הכנה לבחינות',
  emoji: '🏗️',
  fields: [
    { id: 'first', label: 'שם פרטי', type: 'text', placeholder: 'שם פרטי', required: true, half: true },
    { id: 'last', label: 'שם משפחה', type: 'text', placeholder: 'שם משפחה', required: true, half: true },
    { id: 'tz', label: 'תעודת זהות', type: 'numeric', placeholder: '9 ספרות', required: true, maxLength: 9, half: false },
    { id: 'college', label: 'מכללה', type: 'select', required: true, half: false },
  ]
}

async function loadSavedData(base) {
  let questions = [...base]
  let colleges = DEFAULT_COLLEGES
  let participants = []
  let staff = []
  let pendingChanges = []
  let changeHistory = []
  let loginConfig = DEFAULT_LOGIN_CONFIG
  let visitors = []

  const [ansMap, custom, savedColleges, savedParticipants, savedStaff, savedPending, savedHistory, savedConfig, savedVisitors] = await Promise.all([
    sg('q_answers', true), sg('q_custom', true), sg('colleges', true),
    sg('participants', true), sg('staff', true),
    sg('pendingChanges', true), sg('changeHistory', true),
    sg('loginConfig', true), sg('visitors', true),
  ])

  if (ansMap) questions = questions.map(q => ({ ...q, answer: ansMap[q.id] !== undefined ? (ansMap[q.id] || null) : q.answer }))
  if (custom) questions = [...questions, ...custom]
  if (savedColleges) colleges = savedColleges
  if (savedParticipants) participants = savedParticipants
  if (savedStaff) staff = savedStaff
  if (savedPending) pendingChanges = savedPending
  if (savedHistory) changeHistory = savedHistory
  if (savedConfig) loginConfig = savedConfig
  if (savedVisitors) visitors = savedVisitors

  questions = await loadEditMarks(questions)
  return { questions, colleges, participants, staff, pendingChanges, changeHistory, loginConfig, visitors }
}

async function persistQuestions(questions) {
  const map = {}
  questions.forEach(q => { map[q.id] = q.answer || null })
  await ss('q_answers', map, true)
  await ss('q_custom', questions.filter(q => q.custom === true), true)
  // persist edit marks separately so they survive reloads
  const editMap = {}
  questions.forEach(q => { if (q.editedAt) editMap[q.id] = q.editedAt })
  await ss('q_edits', editMap, true)
}

async function loadEditMarks(questions) {
  const editMap = await sg('q_edits', true)
  if (!editMap) return questions
  return questions.map(q => editMap[q.id] ? { ...q, editedAt: editMap[q.id] } : q)
}

// ══════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ══════════════════════════════════════════════════════════════
function LoginScreen({ onLogin, onAdmin, onStaff, colleges, loginConfig }) {
  const cfg = loginConfig || DEFAULT_LOGIN_CONFIG
  const [values, setValues] = useState({})
  const [err, setErr] = useState('')

  function setVal(id, v) { setValues(prev => ({ ...prev, [id]: v })) }
  function getVal(id) { return values[id] || '' }

  function submit() {
    for (const f of cfg.fields) {
      if (f.required && !getVal(f.id).trim()) return setErr(`נא למלא: ${f.label}`)
    }
    const tzField = cfg.fields.find(f => f.id === 'tz')
    if (tzField && !/^\d{9}$/.test(getVal('tz'))) return setErr('תעודת זהות חייבת להכיל 9 ספרות בדיוק')
    setErr('')
    const userData = {}
    cfg.fields.forEach(f => { userData[f.id] = getVal(f.id) })
    // always ensure tz for participant tracking
    if (!userData.tz) userData.tz = `anon_${Date.now()}`
    onLogin(userData)
  }

  // group fields into pairs for half-width
  const rows = []
  let i = 0
  while (i < cfg.fields.length) {
    const f = cfg.fields[i]
    if (f.half && cfg.fields[i + 1]?.half) {
      rows.push([f, cfg.fields[i + 1]])
      i += 2
    } else {
      rows.push([f])
      i++
    }
  }

  return (
    <div style={S.loginBg}>
      <div style={S.loginCard}>
        <div style={S.loginLogo}>
          <span style={{ fontSize: 56 }}>{cfg.emoji || '🏗️'}</span>
          <h1 style={S.loginTitle}>{cfg.title || 'מנהל עבודה בניין'}</h1>
          <p style={S.loginSub}>{cfg.subtitle || 'מערכת הכנה לבחינות'}</p>
        </div>
        {rows.map((row, ri) => (
          <div key={ri} style={row.length === 2 ? S.row2 : {}}>
            {row.map(f => {
              if (f.type === 'select') return (
                <div key={f.id} style={S.formGroup}>
                  <label style={S.label}>{f.label}{f.required ? ' *' : ''}</label>
                  <select style={S.input} value={getVal(f.id)} onChange={e => setVal(f.id, e.target.value)}>
                    <option value="">-- בחר --</option>
                    {colleges.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )
              return (
                <div key={f.id} style={S.formGroup}>
                  <label style={S.label}>{f.label}{f.required ? ' *' : ''}</label>
                  <input style={S.input} value={getVal(f.id)} placeholder={f.placeholder || ''}
                    maxLength={f.maxLength} inputMode={f.type === 'numeric' ? 'numeric' : undefined}
                    onChange={e => {
                      let v = e.target.value
                      if (f.type === 'numeric') v = v.replace(/\D/g, '')
                      setVal(f.id, v)
                    }} />
                </div>
              )
            })}
          </div>
        ))}
        {err && <div style={S.errBox}>{err}</div>}
        <button style={S.btnPrimary} onClick={submit}>כניסה למערכת ←</button>
        <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', justifyContent: 'center', gap: 24 }}>
          <button style={S.adminLink} onClick={onAdmin}>כניסת מנהל</button>
          <button style={S.adminLink} onClick={onStaff}>כניסת עובד</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, maxLength, inputMode }) {
  return (
    <div style={S.formGroup}>
      <label style={S.label}>{label}</label>
      <input style={S.input} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength} inputMode={inputMode} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MENU SCREEN
// ══════════════════════════════════════════════════════════════
function MenuScreen({ user, onSelect, onLogout, history }) {
  return (
    <div style={S.screen}>
      <TopBar title={`שלום, ${user.first} ${user.last}`} sub={user.college} onExit={onLogout} exitLabel="יציאה" />
      <div style={S.container}>
        <h2 style={S.sectionTitle}>בחר סוג פעילות</h2>
        <MenuCard icon="📚" title="תרגול" desc="ענה על שאלות בקצב שלך — תשובה נכונה מוצגת מיד" onClick={() => onSelect('practice')} />
        <MenuCard icon="📝" title="מבחן" desc={`${EXAM_COUNT} שאלות | נדרש ${PASS_SCORE} נכון לפחות`} onClick={() => onSelect('exam')} />
        {history.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <h3 style={{ ...S.sectionTitle, fontSize: 15, marginBottom: 10 }}>היסטוריית מבחנים</h3>
            {history.map((r, i) => (
              <div key={i} style={{ ...S.histRow, borderRight: `4px solid ${r.passed ? 'var(--green)' : 'var(--red)'}` }}>
                <div>
                  <div style={{ fontWeight: 700, color: r.passed ? 'var(--green)' : 'var(--red)' }}>{r.passed ? '✅ עבר' : '❌ לא עבר'}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{r.date}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 20 }}>{r.correct}/{r.total}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MenuCard({ icon, title, desc, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <div style={{ ...S.menuCard, ...(hover ? S.menuCardHover : {}) }} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span style={{ fontSize: 42 }}>{icon}</span>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>{desc}</p>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  PRACTICE SCREEN
// ══════════════════════════════════════════════════════════════
function PracticeScreen({ questions, onExit }) {
  const [qs] = useState(() => shuffle(questions))
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [correct, setCorrect] = useState(0)
  const q = qs[idx]
  const sel = answers[idx]
  const revealed = sel !== undefined
  const letters = LETTERS.filter(l => q.options[l])
  function answer(letter) {
    if (revealed) return
    setAnswers(a => ({ ...a, [idx]: letter }))
    if (letter === q.answer) setCorrect(c => c + 1)
  }
  const pct = ((idx + 1) / qs.length * 100).toFixed(0)
  return (
    <div style={S.screen}>
      <TopBar title="📚 תרגול" onExit={onExit} exitLabel="תפריט ראשי" />
      <div style={S.stickyUnderTop}>
        <ProgressBar pct={pct} left={`שאלה ${idx + 1} מתוך ${qs.length}`} right={`${correct} נכון`} />
      </div>
      <div style={S.container}>
        <QuestionCard q={q} letters={letters} sel={sel} revealed={revealed} onAnswer={answer} />
        <NavRow onPrev={() => setIdx(i => Math.max(0, i - 1))} prevDisabled={idx === 0}
          onNext={() => setIdx(i => Math.min(qs.length - 1, i + 1))} nextDisabled={idx === qs.length - 1}
          nextLabel="הבא →" nextStyle={S.btnBlue} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  EXAM SCREEN
// ══════════════════════════════════════════════════════════════
function ExamScreen({ questions, onFinish, onExit }) {
  const [qs] = useState(() => shuffle(questions).slice(0, Math.min(EXAM_COUNT, questions.length)))
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [showExit, setShowExit] = useState(false)
  const q = qs[idx]
  const sel = answers[idx]
  const letters = LETTERS.filter(l => q.options[l])
  const countCorrect = Object.entries(answers).filter(([i, a]) => a === qs[+i].answer).length
  const countWrong = Object.keys(answers).length - countCorrect
  function finish() {
    let correct = 0
    qs.forEach((q, i) => { if (answers[i] === q.answer) correct++ })
    onFinish({ correct, total: qs.length, passed: correct >= PASS_SCORE, date: new Date().toLocaleDateString('he-IL') })
  }
  const isLast = idx === qs.length - 1
  return (
    <div style={S.screen}>
      <TopBar title="📝 מבחן" onExit={() => setShowExit(true)} exitLabel="יציאה"
        extra={<div style={{ display: 'flex', gap: 8 }}>
          <span style={{ ...S.pill, background: '#dcfce7', color: 'var(--green)' }}>{countCorrect} ✓</span>
          <span style={{ ...S.pill, background: '#fee2e2', color: 'var(--red)' }}>{countWrong} ✗</span>
        </div>} />
      <div style={{ ...S.examGrid, ...S.stickyUnderTop }}>
        {qs.map((q, i) => {
          const a = answers[i]
          let bg = '#f1f5f9', color = '#94a3b8'
          if (i === idx) { bg = 'var(--blue-dark)'; color = 'white' }
          else if (a !== undefined) { bg = a === q.answer ? 'var(--green)' : 'var(--red)'; color = 'white' }
          return <button key={i} style={{ ...S.dot, background: bg, color }} onClick={() => setIdx(i)}>{i + 1}</button>
        })}
      </div>
      <div style={S.container}>
        <QuestionCard q={q} letters={letters} sel={sel} revealed={false} onAnswer={l => setAnswers(a => ({ ...a, [idx]: l }))} />
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--gray-400)', margin: '10px 0' }}>
          ענית על {Object.keys(answers).length} מתוך {qs.length} שאלות
        </p>
        <NavRow onPrev={() => setIdx(i => Math.max(0, i - 1))} prevDisabled={idx === 0}
          onNext={isLast ? null : () => setIdx(i => Math.min(qs.length - 1, i + 1))}
          nextLabel="הבא →" nextStyle={S.btnBlue}
          extraBtn={isLast ? <button style={{ ...S.btnNav, ...S.btnGreen, flex: 1 }} onClick={finish}>סיים מבחן ✓</button> : null} />
      </div>
      {showExit && <Modal title="לצאת מהמבחן?" body="ההתקדמות שלך לא תישמר" confirmLabel="יציאה" cancelLabel="המשך" onConfirm={onExit} onCancel={() => setShowExit(false)} danger />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  RESULT SCREEN
// ══════════════════════════════════════════════════════════════
function ResultScreen({ result, onBack }) {
  const { correct, total, passed } = result
  return (
    <div style={{ ...S.screen, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={S.resultCard}>
        <div style={{ fontSize: 72, marginBottom: 12 }}>{passed ? '🎉' : '😔'}</div>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: passed ? 'var(--green)' : 'var(--red)', marginBottom: 8 }}>
          {passed ? 'עברת את הבחינה!' : 'לא עברת את הבחינה'}
        </h2>
        <div style={{ fontSize: 60, fontWeight: 900, color: 'var(--gray-800)' }}>{correct}/{total}</div>
        <p style={{ color: 'var(--gray-400)', marginBottom: 20, marginTop: 4 }}>תשובות נכונות</p>
        <div style={S.resultGrid}>
          <div style={{ ...S.resultBox, background: '#ecfdf5' }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--green)' }}>{correct}</div>
            <div style={{ fontSize: 13, color: '#065f46' }}>נכון ✓</div>
          </div>
          <div style={{ ...S.resultBox, background: '#fef2f2' }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--red)' }}>{total - correct}</div>
            <div style={{ fontSize: 13, color: '#991b1b' }}>שגוי ✗</div>
          </div>
        </div>
        <p style={S.reqBox}>נדרש: {PASS_SCORE} נכון מתוך {total} | מקסימום {total - PASS_SCORE} טעויות</p>
        <button style={S.btnPrimary} onClick={onBack}>חזרה לתפריט ←</button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  ADMIN LOGIN
// ══════════════════════════════════════════════════════════════
function AdminLoginScreen({ onLogin, onBack }) {
  const [pass, setPass] = useState('')
  const [err, setErr] = useState(false)
  function check() { pass === ADMIN_PASS ? (setErr(false), onLogin()) : setErr(true) }
  return (
    <div style={S.adminLoginBg}>
      <div style={S.adminLoginCard}>
        <h2 style={{ color: 'white', textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>🔐 כניסת מנהל</h2>
        <input type="password" style={S.adminInput} placeholder="סיסמה" value={pass}
          onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && check()} />
        {err && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>סיסמה שגויה</p>}
        <button style={{ ...S.btnPrimary, marginBottom: 10 }} onClick={check}>כניסה</button>
        <button style={S.btnBack} onClick={onBack}>חזרה</button>
        <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: 14 }}>סיסמה: admin123</p>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  STAFF LOGIN
// ══════════════════════════════════════════════════════════════
function StaffLoginScreen({ staff, onLogin, onBack }) {
  const [username, setUsername] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  function check() {
    const member = staff.find(s => s.username === username.trim() && s.password === pass)
    if (member) { setErr(''); onLogin(member) }
    else setErr('שם משתמש או סיסמה שגויים')
  }
  return (
    <div style={S.adminLoginBg}>
      <div style={S.adminLoginCard}>
        <h2 style={{ color: 'white', textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>👤 כניסת עובד</h2>
        <label style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6, display: 'block' }}>שם משתמש</label>
        <input style={S.adminInput} placeholder="שם משתמש" value={username}
          onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && check()} />
        <label style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6, display: 'block' }}>סיסמה</label>
        <input type="password" style={S.adminInput} placeholder="סיסמה" value={pass}
          onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && check()} />
        {err && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{err}</p>}
        <button style={{ ...S.btnPrimary, marginBottom: 10 }} onClick={check}>כניסה</button>
        <button style={S.btnBack} onClick={onBack}>חזרה</button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  QUESTION FORM (shared by admin + staff)
// ══════════════════════════════════════════════════════════════
const EMPTY_FORM = { questionNum: '', question: '', א: '', ב: '', ג: '', ד: '', answer: '' }

function qToForm(q) {
  return {
    questionNum: String(q.id || ''),
    question: q.question || '',
    'א': q.options?.['א'] || '',
    'ב': q.options?.['ב'] || '',
    'ג': q.options?.['ג'] || '',
    'ד': q.options?.['ד'] || '',
    answer: q.answer || '',
  }
}

function QuestionForm({ initial = EMPTY_FORM, onSave, onCancel, saveLabel = 'שמור', title, showNumField = false, existingIds = [] }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const [err, setErr] = useState('')

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (LETTERS.includes(key) && !val.trim() && f.answer === key) next.answer = ''
      return next
    })
  }

  function submit() {
    if (showNumField) {
      if (!form.questionNum.trim()) return setErr('נא להזין מספר שאלה')
      const num = parseInt(form.questionNum)
      if (isNaN(num) || num <= 0) return setErr('מספר שאלה חייב להיות מספר חיובי')
      if (existingIds.includes(num)) return setErr(`שאלה מספר ${num} כבר קיימת במאגר`)
    }
    if (!form.question.trim()) return setErr('נא להזין טקסט שאלה')
    if (!form['א'].trim() || !form['ב'].trim()) return setErr('חובה למלא לפחות תשובות א ו-ב')
    if (!form.answer) return setErr('נא לבחור תשובה נכונה')
    setErr('')
    onSave({
      ...(showNumField ? { id: parseInt(form.questionNum) } : {}),
      question: form.question.trim(),
      options: Object.fromEntries(LETTERS.filter(l => form[l].trim()).map(l => [l, form[l].trim()])),
      answer: form.answer,
    })
  }

  return (
    <div style={S.adminCard}>
      {title && <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 18, color: 'var(--gray-800)' }}>{title}</h3>}

      {showNumField && (
        <div style={S.formGroup}>
          <label style={S.label}>מספר שאלה * (שאלה מספר...)</label>
          <input style={{ ...S.input, maxWidth: 180 }} placeholder="לדוגמה: 217" inputMode="numeric"
            value={form.questionNum} onChange={e => set('questionNum', e.target.value.replace(/\D/g, ''))} />
        </div>
      )}

      <div style={S.formGroup}>
        <label style={S.label}>טקסט השאלה *</label>
        <textarea style={{ ...S.input, minHeight: 86, resize: 'vertical', lineHeight: 1.6 }} dir="rtl"
          placeholder="הזן את טקסט השאלה כאן..." value={form.question}
          onChange={e => set('question', e.target.value)} />
      </div>

      <div style={{ background: 'var(--gray-50)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-600)', marginBottom: 12 }}>
          תשובות אפשריות — לחץ על האות לסימון התשובה הנכונה
        </p>
        {LETTERS.map(l => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div title="לחץ לסמן כתשובה נכונה" style={{
              ...S.optLetter, flexShrink: 0, cursor: 'pointer',
              background: form.answer === l ? 'var(--green)' : form[l].trim() ? 'var(--blue-light)' : 'var(--gray-200)',
              color: form.answer === l || form[l].trim() ? 'white' : 'var(--gray-500)',
            }} onClick={() => { if (form[l].trim()) set('answer', l) }}>{l}</div>
            <input style={{ ...S.input, marginBottom: 0, flex: 1 }}
              placeholder={`תשובה ${l}${l === 'א' || l === 'ב' ? ' *' : ' (אופציונלי)'}`}
              value={form[l]} onChange={e => set(l, e.target.value)} />
          </div>
        ))}
      </div>

      {form.answer
        ? <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#065f46', fontWeight: 600, marginBottom: 14 }}>
            ✓ תשובה נכונה: <strong>{form.answer}</strong> — {form[form.answer]}
          </div>
        : <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 14 }}>
            ⚠️ לא נבחרה תשובה נכונה — לחץ על אות כדי לבחור
          </div>
      }

      {err && <div style={{ ...S.errBox, marginBottom: 14 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ ...S.btnNav, ...S.btnGreen, flex: 1 }} onClick={submit}>{saveLabel}</button>
        {onCancel && <button style={{ ...S.btnNav, flex: 1 }} onClick={onCancel}>ביטול</button>}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  STAFF PANEL
// ══════════════════════════════════════════════════════════════
function StaffPanel({ staffMember, questions, onSubmitChange, onExit }) {
  const [tab, setTab] = useState('list')
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const existingIds = questions.map(q => q.id)
  const filtered = questions.filter(q =>
    String(q.id).includes(search) || q.question.toLowerCase().includes(search.toLowerCase())
  )

  function submitChange(type, data, originalId = null) {
    onSubmitChange({
      id: Date.now(), type, staffId: staffMember.id, staffName: staffMember.name,
      timestamp: nowStr(), status: 'pending', data, originalId,
    })
    setEditId(null)
    setTab('list')
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 4000)
  }

  const tabStyle = key => ({
    flex: 1, padding: '12px 6px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    border: 'none', cursor: 'pointer',
    background: tab === key ? '#1e40af' : 'transparent',
    color: tab === key ? 'white' : '#9ca3af',
    borderBottom: tab === key ? '3px solid #60a5fa' : '3px solid transparent',
  })

  return (
    <div style={S.screen}>
      <div style={S.adminBar}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>👤 {staffMember.name}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>כניסת עובד</div>
        </div>
        <button style={S.btnExit} onClick={onExit}>יציאה</button>
      </div>

      <div style={S.adminTabs}>
        <button style={tabStyle('list')} onClick={() => { setTab('list'); setEditId(null) }}>📋 שאלות ({questions.length})</button>
        <button style={tabStyle('add')} onClick={() => { setTab('add'); setEditId(null) }}>➕ הוסף שאלה</button>
      </div>

      {submitted && (
        <div style={{ background: '#ecfdf5', borderBottom: '2px solid #a7f3d0', padding: '12px 20px', fontSize: 14, color: '#065f46', fontWeight: 600, textAlign: 'center' }}>
          ✅ הבקשה נשלחה לאישור המנהל
        </div>
      )}

      {tab === 'list' && (
        <div style={S.container}>
          <div style={{ ...S.adminCard, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: '#92400e' }}>⚠️ כל שינוי שתבצע ישלח לאישור המנהל לפני שיופיע בשאלות</p>
          </div>
          <input style={{ ...S.input, marginBottom: 16 }} placeholder="חפש לפי מספר שאלה או תוכן..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {filtered.map(q => {
            const opts = LETTERS.filter(l => q.options?.[l])
            const isEditing = editId === q.id
            return (
              <div key={q.id} style={S.adminCard}>
                <div style={S.adminCardHeader}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={S.qNum}>שאלה {q.id}</span>
                    <span style={{ ...S.ansBadge, ...(q.answer ? S.ansBadgeGreen : S.ansBadgeYellow) }}>
                      {q.answer ? `תשובה: ${q.answer}` : 'ללא תשובה'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={S.btnEdit} onClick={() => setEditId(isEditing ? null : q.id)}>
                      {isEditing ? '✕ סגור' : '✏️ ערוך'}
                    </button>
                    <button style={{ ...S.btnEdit, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }}
                      onClick={() => submitChange('delete', { id: q.id, question: q.question }, q.id)}>
                      🗑️ בקש מחיקה
                    </button>
                  </div>
                </div>
                {!isEditing && (
                  <>
                    <p style={S.adminQText}>{q.question}</p>
                    <div style={S.adminOpts}>
                      {opts.map(l => <div key={l} style={{ ...S.adminOpt, ...(q.answer === l ? S.adminOptCorrect : {}) }}><strong>{l}.</strong> {q.options[l]}</div>)}
                    </div>
                  </>
                )}
                {isEditing && (
                  <div style={{ marginTop: 16 }}>
                    <QuestionForm initial={qToForm(q)} saveLabel="📤 שלח לאישור מנהל"
                      onSave={data => submitChange('edit', data, q.id)}
                      onCancel={() => setEditId(null)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'add' && (
        <div style={S.container}>
          <div style={{ ...S.adminCard, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 4 }}>
            <p style={{ fontSize: 13, color: '#92400e' }}>⚠️ שאלה חדשה תישלח לאישור מנהל לפני הוספה</p>
          </div>
          <QuestionForm title="➕ הוספת שאלה חדשה" showNumField existingIds={existingIds}
            saveLabel="📤 שלח לאישור מנהל"
            onSave={data => submitChange('add', { ...data, custom: true })} />
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  ADMIN PANEL
// ══════════════════════════════════════════════════════════════
function AdminPanel({ questions, onUpdate, onAdd, onDelete, colleges, onCollegesChange, participants, onDeleteParticipant, visitors, staff, onStaffChange, pendingChanges, onApprove, onReject, changeHistory, loginConfig, onLoginConfigChange, onExit }) {
  const [tab, setTab] = useState('list')
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [savedId, setSavedId] = useState(null)

  const existingIds = questions.map(q => q.id)
  const filtered = questions.filter(q =>
    String(q.id).includes(search) || q.question.toLowerCase().includes(search.toLowerCase())
  )
  const pendingCount = pendingChanges.filter(c => c.status === 'pending').length

  function handleUpdate(id, data) {
    onUpdate(id, data); setEditId(null); setSavedId(id); setTimeout(() => setSavedId(null), 2500)
  }

  const tabStyle = key => ({
    flex: '0 0 auto', padding: '10px 9px', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
    background: tab === key ? '#1e40af' : 'transparent',
    color: tab === key ? 'white' : '#9ca3af',
    borderBottom: tab === key ? '3px solid #60a5fa' : '3px solid transparent',
  })

  return (
    <div style={S.screen}>
      <div style={S.adminBar}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>⚙️ פאנל מנהל</span>
        <button style={S.btnExit} onClick={onExit}>יציאה</button>
      </div>

      <div style={{ display: 'flex', background: '#111827', borderBottom: '2px solid #374151', overflowX: 'auto' }}>
        <button style={tabStyle('list')} onClick={() => { setTab('list'); setEditId(null) }}>📋 שאלות ({questions.length})</button>
        <button style={tabStyle('add')} onClick={() => { setTab('add'); setEditId(null) }}>➕ הוסף</button>
        <button style={tabStyle('pending')} onClick={() => setTab('pending')}>
          ⏳ ממתין{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>
        <button style={tabStyle('history')} onClick={() => setTab('history')}>📜 היסטוריה</button>
        <button style={tabStyle('participants')} onClick={() => setTab('participants')}>👥 משתתפים</button>
        <button style={tabStyle('staff')} onClick={() => setTab('staff')}>👤 עובדים</button>
        <button style={tabStyle('colleges')} onClick={() => setTab('colleges')}>🏫 מוסדות</button>
        <button style={tabStyle('visitors')} onClick={() => setTab('visitors')}>📊 כניסות</button>
        <button style={tabStyle('loginpage')} onClick={() => setTab('loginpage')}>🎨 דף כניסה</button>
      </div>

      {/* LIST */}
      {tab === 'list' && (
        <div style={S.container}>
          <input style={{ ...S.input, marginBottom: 16 }} placeholder="חפש לפי מספר שאלה או תוכן..."
            value={search} onChange={e => { setSearch(e.target.value); setEditId(null) }} />
          {filtered.length === 0 && <p style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>לא נמצאו שאלות</p>}
          {filtered.map(q => {
            const opts = LETTERS.filter(l => q.options?.[l])
            const isEditing = editId === q.id
            const isCustom = q.custom === true
            const wasSaved = savedId === q.id
            return (
              <div key={q.id} style={{ ...S.adminCard, borderRight: isCustom ? '4px solid #a78bfa' : undefined, outline: wasSaved ? '2px solid var(--green)' : undefined }}>
                <div style={S.adminCardHeader}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={S.qNum}>שאלה {q.id}</span>
                    {isCustom && <span style={{ ...S.ansBadge, background: '#ede9fe', color: '#6d28d9' }}>✨ חדש</span>}
                    {!isCustom && q.editedAt && <span style={{ ...S.ansBadge, background: '#fef9c3', color: '#92400e' }} title={`נערך: ${q.editedAt}`}>✏️ נערך</span>}
                    {wasSaved && <span style={{ ...S.ansBadge, ...S.ansBadgeGreen }}>✅ נשמר</span>}
                    <span style={{ ...S.ansBadge, ...(q.answer ? S.ansBadgeGreen : S.ansBadgeYellow) }}>
                      {q.answer ? `תשובה: ${q.answer}` : 'ללא תשובה'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{ ...S.btnEdit, ...(isEditing ? { background: '#fef9c3', color: '#92400e', borderColor: '#fde68a' } : {}) }}
                      onClick={() => setEditId(isEditing ? null : q.id)}>{isEditing ? '✕ סגור' : '✏️ ערוך'}</button>
                    <button style={{ ...S.btnEdit, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }}
                      onClick={() => setDeleteId(q.id)}>🗑️</button>
                  </div>
                </div>
                {!isEditing && (
                  <>
                    <p style={S.adminQText}>{q.question}</p>
                    <div style={S.adminOpts}>
                      {opts.map(l => <div key={l} style={{ ...S.adminOpt, ...(q.answer === l ? S.adminOptCorrect : {}) }}><strong>{l}.</strong> {q.options[l]}</div>)}
                    </div>
                  </>
                )}
                {isEditing && (
                  <div style={{ marginTop: 16 }}>
                    <QuestionForm initial={qToForm(q)} onSave={data => handleUpdate(q.id, data)}
                      onCancel={() => setEditId(null)} saveLabel="💾 שמור שינויים" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ADD */}
      {tab === 'add' && (
        <div style={S.container}>
          <QuestionForm title="➕ הוספת שאלה חדשה" showNumField existingIds={existingIds}
            onSave={data => { onAdd(data); setTab('list') }} saveLabel="הוסף שאלה ←" />
        </div>
      )}

      {/* PENDING */}
      {tab === 'pending' && (
        <PendingTab pendingChanges={pendingChanges} questions={questions} onApprove={onApprove} onReject={onReject} />
      )}

      {/* HISTORY */}
      {tab === 'history' && <HistoryTab changeHistory={changeHistory} />}

      {/* PARTICIPANTS */}
      {tab === 'participants' && <ParticipantsTab participants={participants} onDelete={onDeleteParticipant} />}

      {/* STAFF */}
      {tab === 'staff' && <StaffTab staff={staff} onChange={onStaffChange} />}

      {/* COLLEGES */}
      {tab === 'colleges' && <CollegesTab colleges={colleges} onChange={onCollegesChange} />}
      {tab === 'visitors' && <VisitorsTab visitors={visitors} />}
      {tab === 'loginpage' && <LoginPageEditor config={loginConfig} onChange={onLoginConfigChange} colleges={colleges} />}

      {/* VISITORS */}
      {tab === 'visitors' && <VisitorsTab visitors={visitors} />}

      {/* LOGIN PAGE EDITOR */}
      {tab === 'loginpage' && <LoginPageEditor config={loginConfig} onChange={onLoginConfigChange} colleges={colleges} />}

      {deleteId !== null && (
        <Modal title="למחוק שאלה זו?" body="פעולה זו אינה ניתנת לביטול" confirmLabel="מחק" cancelLabel="ביטול"
          onConfirm={() => { onDelete(deleteId); setDeleteId(null) }} onCancel={() => setDeleteId(null)} danger />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  PENDING TAB
// ══════════════════════════════════════════════════════════════
function PendingTab({ pendingChanges, questions, onApprove, onReject }) {
  const pending = pendingChanges.filter(c => c.status === 'pending')
  const typeLabel = { add: '➕ הוספה', edit: '✏️ עריכה', delete: '🗑️ מחיקה' }
  const typeBorder = { add: '#a7f3d0', edit: '#bfdbfe', delete: '#fecaca' }
  const typeBg = { add: '#ecfdf5', edit: '#eff6ff', delete: '#fef2f2' }
  const typeColor = { add: '#065f46', edit: '#1e40af', delete: '#991b1b' }

  if (pending.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <p style={{ color: 'var(--gray-400)', fontSize: 15 }}>אין שינויים הממתינים לאישור</p>
    </div>
  )

  return (
    <div style={S.container}>
      <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>{pending.length} שינויים ממתינים לאישורך</p>
      {pending.map(c => {
        const origQ = c.originalId ? questions.find(q => q.id === c.originalId) : null
        return (
          <div key={c.id} style={{ ...S.adminCard, border: `2px solid ${typeBorder[c.type] || '#e2e8f0'}` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ ...S.ansBadge, background: typeBg[c.type], color: typeColor[c.type], border: `1px solid ${typeBorder[c.type]}` }}>{typeLabel[c.type]}</span>
              <span style={S.qNum}>מאת: {c.staffName}</span>
              {c.originalId && <span style={S.qNum}>שאלה {c.originalId}</span>}
              <span style={{ fontSize: 12, color: 'var(--gray-400)', marginRight: 'auto' }}>📅 {c.timestamp}</span>
            </div>

            {c.type === 'delete' && origQ && (
              <div style={{ background: '#fef2f2', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>שאלה למחיקה:</p>
                <p style={{ fontSize: 13 }}>{origQ.question}</p>
              </div>
            )}

            {c.type !== 'delete' && c.data && (
              <div>
                {c.type === 'edit' && origQ && (
                  <div style={{ background: '#fef2f2', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>לפני:</p>
                    <p style={{ fontSize: 13 }}>{origQ.question}</p>
                  </div>
                )}
                <div style={{ background: '#ecfdf5', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#065f46', marginBottom: 6 }}>{c.type === 'edit' ? 'אחרי:' : 'שאלה חדשה:'}</p>
                  {c.data.id && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', marginBottom: 4 }}>שאלה מספר {c.data.id}</p>}
                  <p style={{ fontSize: 13, marginBottom: 8 }}>{c.data.question}</p>
                  {c.data.options && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      {LETTERS.filter(l => c.data.options[l]).map(l => (
                        <div key={l} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: c.data.answer === l ? 'var(--green)' : 'var(--gray-100)', color: c.data.answer === l ? 'white' : 'var(--gray-700)' }}>
                          <strong>{l}.</strong> {c.data.options[l]}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...S.btnNav, ...S.btnGreen, flex: 1, padding: 12 }} onClick={() => onApprove(c)}>✅ אשר</button>
              <button style={{ ...S.btnNav, background: 'var(--red)', color: 'white', border: '2px solid var(--red)', flex: 1, padding: 12 }} onClick={() => onReject(c)}>❌ דחה</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  HISTORY TAB
// ══════════════════════════════════════════════════════════════
function HistoryTab({ changeHistory }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? changeHistory : changeHistory.filter(c => c.status === filter)
  const typeLabel = { add: '➕ הוספה', edit: '✏️ עריכה', delete: '🗑️ מחיקה' }
  const statusStyle = {
    approved: { bg: '#ecfdf5', color: '#065f46', label: '✅ אושר' },
    rejected: { bg: '#fef2f2', color: '#991b1b', label: '❌ נדחה' },
    pending: { bg: '#fffbeb', color: '#92400e', label: '⏳ ממתין' },
  }

  return (
    <div style={S.container}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['all', `הכל (${changeHistory.length})`], ['approved', 'אושרו'], ['rejected', 'נדחו']].map(([val, label]) => (
          <button key={val} style={{ ...S.btnNav, padding: '8px 16px', fontSize: 13, ...(filter === val ? S.btnBlue : {}) }}
            onClick={() => setFilter(val)}>{label}</button>
        ))}
      </div>
      {filtered.length === 0 && <p style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>אין רשומות</p>}
      {[...filtered].reverse().map(c => {
        const ss = statusStyle[c.status] || {}
        return (
          <div key={c.id} style={{ ...S.adminCard, borderRight: `4px solid ${c.status === 'approved' ? 'var(--green)' : c.status === 'rejected' ? 'var(--red)' : '#fbbf24'}` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ ...S.ansBadge, background: ss.bg, color: ss.color }}>{ss.label}</span>
              <span style={S.qNum}>{typeLabel[c.type] || c.type}</span>
              {c.originalId && <span style={S.qNum}>שאלה {c.originalId}</span>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 4 }}>
              👤 {c.staffName} {c.adminName ? `→ ${c.adminName}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: c.data?.question ? 8 : 0 }}>📅 {c.timestamp}</div>
            {c.data?.question && (
              <div style={{ padding: '8px 10px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 13 }}>
                {c.data.id && <span style={{ fontWeight: 700, color: 'var(--blue)' }}>שאלה {c.data.id}: </span>}
                {c.data.question}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  PARTICIPANTS TAB
// ══════════════════════════════════════════════════════════════
function ParticipantsTab({ participants, onDelete }) {
  const [search, setSearch] = useState('')
  const [deleteP, setDeleteP] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const filtered = [...participants]
    .filter(p => `${p.first} ${p.last} ${p.tz} ${p.college}`.toLowerCase().includes(search.toLowerCase()))

  if (participants.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
      <p style={{ color: 'var(--gray-400)' }}>עדיין אין משתתפים רשומים</p>
    </div>
  )

  return (
    <div style={S.container}>
      <input style={{ ...S.input, marginBottom: 16 }} placeholder="חפש לפי שם, ת.ז. או מוסד..."
        value={search} onChange={e => setSearch(e.target.value)} />
      <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 12 }}>
        {filtered.length} משתתפים | {participants.reduce((s, p) => s + (p.exams?.length || 0), 0)} מבחנים סה"כ
      </p>
      {filtered.map(p => {
        const passCount = (p.exams || []).filter(e => e.passed).length
        const best = (p.exams || []).reduce((b, e) => e.correct > (b?.correct || 0) ? e : b, null)
        const isEx = expanded === p.tz
        return (
          <div key={p.tz} style={{ ...S.adminCard, borderRight: `4px solid ${passCount > 0 ? 'var(--green)' : 'var(--red)'}` }}>
            <div style={S.adminCardHeader}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{p.first} {p.last}</span>
                  <span style={{ ...S.ansBadge, background: 'var(--gray-100)', color: 'var(--gray-600)' }}>ת.ז: {p.tz}</span>
                  <span style={{ ...S.ansBadge, ...(passCount > 0 ? S.ansBadgeGreen : S.ansBadgeYellow) }}>
                    {passCount > 0 ? `✅ עבר (${passCount})` : '❌ לא עבר'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                  🏫 {p.college} | 📝 {p.exams?.length || 0} מבחנים {best ? `| 🏆 שיא: ${best.correct}/${best.total}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={S.btnEdit} onClick={() => setExpanded(isEx ? null : p.tz)}>{isEx ? '▲' : '▼ פרוט'}</button>
                <button style={{ ...S.btnEdit, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }}
                  onClick={() => setDeleteP(p.tz)}>🗑️</button>
              </div>
            </div>
            {isEx && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
                {(p.exams || []).slice().reverse().map((e, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, marginBottom: 6, background: e.passed ? '#ecfdf5' : '#fef2f2', border: `1px solid ${e.passed ? '#a7f3d0' : '#fecaca'}` }}>
                    <span style={{ fontSize: 13, color: e.passed ? '#065f46' : '#991b1b', fontWeight: 600 }}>{e.passed ? '✅' : '❌'} {e.correct}/{e.total}</span>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{e.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {deleteP && <Modal title="למחוק משתתף?" body="כל נתוני המבחנים יימחקו" confirmLabel="מחק" cancelLabel="ביטול"
        onConfirm={() => { onDelete(deleteP); setDeleteP(null) }} onCancel={() => setDeleteP(null)} danger />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  STAFF TAB
// ══════════════════════════════════════════════════════════════
function StaffTab({ staff, onChange }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [deleteIdx, setDeleteIdx] = useState(null)
  const [editIdx, setEditIdx] = useState(null)

  function addStaff() {
    if (!name.trim()) return setErr('נא להזין שם עובד')
    if (!username.trim()) return setErr('נא להזין שם משתמש')
    if (password.length < 4) return setErr('סיסמה חייבת להכיל לפחות 4 תווים')
    if (staff.some(s => s.username === username.trim())) return setErr('שם משתמש כבר קיים')
    onChange([...staff, { id: Date.now(), name: name.trim(), username: username.trim(), password: password.trim() }])
    setName(''); setUsername(''); setPassword(''); setErr(''); setShowAdd(false)
  }

  return (
    <div style={S.container}>
      <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>
        עובדים יכולים להוסיף, לערוך ולמחוק שאלות — כל שינוי מצריך אישורך.
      </p>
      {staff.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>👤</div>
          <p style={{ color: 'var(--gray-400)', marginBottom: 16 }}>אין עובדים רשומים</p>
        </div>
      )}
      {staff.map((s, i) => (
        <div key={s.id} style={S.adminCard}>
          {editIdx === i ? (
            <EditStaffForm staff={s}
              onSave={updated => { onChange(staff.map((x, j) => j === i ? updated : x)); setEditIdx(null) }}
              onCancel={() => setEditIdx(null)}
              allUsernames={staff.filter((_, j) => j !== i).map(x => x.username)} />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 2 }}>👤 {s.username}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={S.btnEdit} onClick={() => setEditIdx(i)}>✏️ ערוך</button>
                <button style={{ ...S.btnEdit, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }}
                  onClick={() => setDeleteIdx(i)}>🗑️</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {showAdd ? (
        <div style={S.adminCard}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>➕ הוספת עובד חדש</h3>
          <div style={S.formGroup}><label style={S.label}>שם מלא *</label>
            <input style={S.input} placeholder="שם ושם משפחה" value={name} onChange={e => setName(e.target.value)} /></div>
          <div style={S.formGroup}><label style={S.label}>שם משתמש *</label>
            <input style={S.input} placeholder="לכניסה למערכת" value={username} onChange={e => setUsername(e.target.value)} /></div>
          <div style={S.formGroup}><label style={S.label}>סיסמה * (לפחות 4 תווים)</label>
            <input style={S.input} placeholder="סיסמה" value={password} onChange={e => setPassword(e.target.value)} /></div>
          {err && <div style={{ ...S.errBox, marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ ...S.btnNav, ...S.btnGreen, flex: 1 }} onClick={addStaff}>הוסף עובד</button>
            <button style={{ ...S.btnNav, flex: 1 }} onClick={() => { setShowAdd(false); setErr('') }}>ביטול</button>
          </div>
        </div>
      ) : (
        <button style={{ ...S.btnNav, ...S.btnBlue, width: '100%' }} onClick={() => setShowAdd(true)}>➕ הוסף עובד חדש</button>
      )}

      {deleteIdx !== null && (
        <Modal title={`למחוק את ${staff[deleteIdx]?.name}?`} body="העובד לא יוכל יותר להתחבר"
          confirmLabel="מחק" cancelLabel="ביטול"
          onConfirm={() => { onChange(staff.filter((_, i) => i !== deleteIdx)); setDeleteIdx(null) }}
          onCancel={() => setDeleteIdx(null)} danger />
      )}
    </div>
  )
}

function EditStaffForm({ staff, onSave, onCancel, allUsernames }) {
  const [name, setName] = useState(staff.name)
  const [username, setUsername] = useState(staff.username)
  const [password, setPassword] = useState(staff.password)
  const [err, setErr] = useState('')
  function save() {
    if (!name.trim() || !username.trim()) return setErr('שם ושם משתמש חובה')
    if (password.length < 4) return setErr('סיסמה לפחות 4 תווים')
    if (allUsernames.includes(username.trim())) return setErr('שם משתמש כבר קיים')
    onSave({ ...staff, name: name.trim(), username: username.trim(), password: password.trim() })
  }
  return (
    <div>
      <div style={S.formGroup}><label style={S.label}>שם מלא</label><input style={S.input} value={name} onChange={e => setName(e.target.value)} /></div>
      <div style={S.formGroup}><label style={S.label}>שם משתמש</label><input style={S.input} value={username} onChange={e => setUsername(e.target.value)} /></div>
      <div style={S.formGroup}><label style={S.label}>סיסמה</label><input style={S.input} value={password} onChange={e => setPassword(e.target.value)} /></div>
      {err && <div style={{ ...S.errBox, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ ...S.btnNav, ...S.btnGreen, flex: 1 }} onClick={save}>💾 שמור</button>
        <button style={{ ...S.btnNav, flex: 1 }} onClick={onCancel}>ביטול</button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  COLLEGES TAB
// ══════════════════════════════════════════════════════════════
function CollegesTab({ colleges, onChange }) {
  const [editIdx, setEditIdx] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [newVal, setNewVal] = useState('')
  const [err, setErr] = useState('')
  const [deleteIdx, setDeleteIdx] = useState(null)

  function saveEdit() {
    if (!editVal.trim()) return setErr('שם לא יכול להיות ריק')
    if (colleges.some((c, i) => c === editVal.trim() && i !== editIdx)) return setErr('מוסד זה כבר קיים')
    onChange(colleges.map((c, i) => i === editIdx ? editVal.trim() : c))
    setEditIdx(null); setErr('')
  }

  function addCollege() {
    if (!newVal.trim() || colleges.includes(newVal.trim())) return setErr('שם לא תקין או כבר קיים')
    onChange([...colleges, newVal.trim()]); setNewVal(''); setErr('')
  }

  return (
    <div style={S.container}>
      <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>רשימת המוסדות מופיעה בטופס ההרשמה</p>
      {colleges.map((c, i) => (
        <div key={i} style={S.adminCard}>
          {editIdx === i ? (
            <div>
              <input style={{ ...S.input, marginBottom: 10 }} value={editVal} onChange={e => setEditVal(e.target.value)}
                autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
              {err && <div style={{ ...S.errBox, marginBottom: 10 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={{ ...S.btnNav, ...S.btnGreen, flex: 1 }} onClick={saveEdit}>💾 שמור</button>
                <button style={{ ...S.btnNav, flex: 1 }} onClick={() => { setEditIdx(null); setErr('') }}>ביטול</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>🏫 {c}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={S.btnEdit} onClick={() => { setEditIdx(i); setEditVal(c); setErr('') }}>✏️</button>
                <button style={{ ...S.btnEdit, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }}
                  onClick={() => setDeleteIdx(i)}>🗑️</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ ...S.adminCard, background: 'var(--blue-pale)', border: '2px dashed var(--blue-light)' }}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--blue)' }}>➕ הוסף מוסד חדש</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input style={{ ...S.input, flex: 1, marginBottom: 0 }} placeholder="שם המוסד..."
            value={newVal} onChange={e => setNewVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCollege()} />
          <button style={{ ...S.btnNav, ...S.btnBlue }} onClick={addCollege}>הוסף</button>
        </div>
        {err && editIdx === null && <div style={{ ...S.errBox, marginTop: 10 }}>{err}</div>}
      </div>
      {deleteIdx !== null && (
        <Modal title="למחוק מוסד זה?" body={`"${colleges[deleteIdx]}" יוסר מרשימה`}
          confirmLabel="מחק" cancelLabel="ביטול"
          onConfirm={() => { onChange(colleges.filter((_, i) => i !== deleteIdx)); setDeleteIdx(null) }}
          onCancel={() => setDeleteIdx(null)} danger />
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
//  VISITORS TAB
// ══════════════════════════════════════════════════════════════
function VisitorsTab({ visitors }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | exam | noexam

  const filtered = visitors.filter(v => {
    const matchSearch = `${v.name} ${v.tz} ${v.college}`.toLowerCase().includes(search.toLowerCase())
    if (!matchSearch) return false
    if (filter === 'exam') return v.exam != null
    if (filter === 'noexam') return v.exam == null
    return true
  })

  const totalExams = visitors.filter(v => v.exam).length
  const totalPassed = visitors.filter(v => v.exam?.passed).length

  return (
    <div style={S.container}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ ...S.adminCard, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--blue)' }}>{visitors.length}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>כניסות</div>
        </div>
        <div style={{ ...S.adminCard, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#8b5cf6' }}>{totalExams}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>מבחנים</div>
        </div>
        <div style={{ ...S.adminCard, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)' }}>{totalPassed}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>עברו</div>
        </div>
      </div>

      <input style={{ ...S.input, marginBottom: 10 }} placeholder="חפש לפי שם, ת.ז. או מוסד..."
        value={search} onChange={e => setSearch(e.target.value)} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['all','הכל'],['exam','עם מבחן'],['noexam','ללא מבחן']].map(([v, lbl]) => (
          <button key={v} style={{ ...S.btnNav, padding: '7px 14px', fontSize: 12, ...(filter === v ? S.btnBlue : {}) }}
            onClick={() => setFilter(v)}>{lbl}</button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--gray-400)', marginRight: 'auto', alignSelf: 'center' }}>{filtered.length} רשומות</span>
      </div>

      {filtered.length === 0 && <p style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>אין נתונים</p>}

      {filtered.map((v, i) => (
        <div key={i} style={{ ...S.adminCard, borderRight: `4px solid ${v.exam?.passed ? 'var(--green)' : v.exam ? 'var(--red)' : 'var(--gray-200)'}`, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{v.name || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                {v.tz && !v.tz.startsWith('anon') ? `ת.ז: ${v.tz} | ` : ''}{v.college || '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>🕐 {v.loginAt}</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              {v.exam ? (
                <div>
                  <span style={{ ...S.ansBadge, ...(v.exam.passed ? S.ansBadgeGreen : { background: '#fef2f2', color: 'var(--red)' }) }}>
                    {v.exam.passed ? '✅ עבר' : '❌ לא עבר'} {v.exam.correct}/{v.exam.total}
                  </span>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>{v.exam.date}</div>
                </div>
              ) : (
                <span style={{ ...S.ansBadge, background: 'var(--gray-100)', color: 'var(--gray-500)' }}>לא נבחן</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  LOGIN PAGE EDITOR
// ══════════════════════════════════════════════════════════════
function LoginPageEditor({ config, onChange, colleges }) {
  const [cfg, setCfg] = useState(config || DEFAULT_LOGIN_CONFIG)
  const [saved, setSaved] = useState(false)
  const [editFieldIdx, setEditFieldIdx] = useState(null)
  const [preview, setPreview] = useState(false)

  function update(key, val) { setCfg(c => ({ ...c, [key]: val })) }

  function updateField(idx, key, val) {
    setCfg(c => {
      const fields = [...c.fields]
      fields[idx] = { ...fields[idx], [key]: val }
      return { ...c, fields }
    })
  }

  function addField() {
    setCfg(c => ({
      ...c,
      fields: [...c.fields, { id: `field_${Date.now()}`, label: 'שדה חדש', type: 'text', placeholder: '', required: false, half: false }]
    }))
    setEditFieldIdx(cfg.fields.length)
  }

  function removeField(idx) {
    setCfg(c => ({ ...c, fields: c.fields.filter((_, i) => i !== idx) }))
    setEditFieldIdx(null)
  }

  function moveField(idx, dir) {
    setCfg(c => {
      const fields = [...c.fields]
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= fields.length) return c
      ;[fields[idx], fields[newIdx]] = [fields[newIdx], fields[idx]]
      return { ...c, fields }
    })
    setEditFieldIdx(idx + dir)
  }

  function save() {
    onChange(cfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function reset() {
    const fresh = DEFAULT_LOGIN_CONFIG
    setCfg(fresh)
    onChange(fresh)
  }

  return (
    <div style={S.container}>
      {saved && (
        <div style={{ ...S.adminCard, background: '#ecfdf5', border: '1px solid #a7f3d0', textAlign: 'center', color: '#065f46', fontWeight: 700, marginBottom: 12 }}>
          ✅ השינויים נשמרו!
        </div>
      )}

      {/* Header settings */}
      <div style={S.adminCard}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--gray-800)' }}>🏷️ כותרת הדף</h3>
        <div style={S.formGroup}>
          <label style={S.label}>אמוג'י</label>
          <input style={{ ...S.input, maxWidth: 80 }} value={cfg.emoji || '🏗️'} onChange={e => update('emoji', e.target.value)} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>כותרת ראשית</label>
          <input style={S.input} value={cfg.title || ''} onChange={e => update('title', e.target.value)} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>כתובית (subtitle)</label>
          <input style={S.input} value={cfg.subtitle || ''} onChange={e => update('subtitle', e.target.value)} />
        </div>
      </div>

      {/* Fields editor */}
      <div style={S.adminCard}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: 'var(--gray-800)' }}>📝 שדות הטופס</h3>
        <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>ניתן להוסיף, לערוך, למחוק ולסדר שדות</p>

        {cfg.fields.map((f, idx) => {
          const isEdit = editFieldIdx === idx
          const isSystem = ['tz', 'college'].includes(f.id)
          return (
            <div key={f.id || idx} style={{ ...S.adminCard, background: isEdit ? 'var(--blue-pale)' : 'var(--gray-50)', border: isEdit ? '2px solid var(--blue-light)' : '1px solid var(--gray-200)', marginBottom: 8 }}>
              {isEdit ? (
                <div>
                  <div style={S.row2}>
                    <div style={S.formGroup}>
                      <label style={S.label}>תווית (Label)</label>
                      <input style={S.input} value={f.label} onChange={e => updateField(idx, 'label', e.target.value)} />
                    </div>
                    <div style={S.formGroup}>
                      <label style={S.label}>Placeholder</label>
                      <input style={S.input} value={f.placeholder || ''} onChange={e => updateField(idx, 'placeholder', e.target.value)} />
                    </div>
                  </div>
                  <div style={S.row2}>
                    <div style={S.formGroup}>
                      <label style={S.label}>סוג שדה</label>
                      <select style={S.input} value={f.type} onChange={e => updateField(idx, 'type', e.target.value)} disabled={isSystem}>
                        <option value="text">טקסט</option>
                        <option value="numeric">מספרי</option>
                        <option value="select">רשימה (מוסד)</option>
                      </select>
                    </div>
                    <div style={S.formGroup}>
                      <label style={S.label}>מקסימום תווים</label>
                      <input style={S.input} type="number" value={f.maxLength || ''} onChange={e => updateField(idx, 'maxLength', parseInt(e.target.value) || undefined)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!f.required} onChange={e => updateField(idx, 'required', e.target.checked)} />
                      חובה
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!f.half} onChange={e => updateField(idx, 'half', e.target.checked)} />
                      חצי רוחב (2 בשורה)
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={{ ...S.btnEdit, ...S.btnBlue }} onClick={() => setEditFieldIdx(null)}>✓ סגור</button>
                    {!isSystem && <button style={{ ...S.btnEdit, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }} onClick={() => removeField(idx)}>🗑️ מחק</button>}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{f.label}</span>
                    {f.required && <span style={{ ...S.ansBadge, background: '#fee2e2', color: 'var(--red)', marginRight: 8, marginLeft: 0 }}>חובה</span>}
                    {f.half && <span style={{ ...S.ansBadge, background: 'var(--blue-pale)', color: 'var(--blue)', marginRight: 4 }}>חצי</span>}
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{f.type === 'select' ? 'רשימת מוסדות' : f.type === 'numeric' ? 'מספרי' : 'טקסט'} {f.placeholder ? `| "${f.placeholder}"` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={{ ...S.btnEdit, padding: '4px 8px' }} onClick={() => moveField(idx, -1)} disabled={idx === 0}>▲</button>
                    <button style={{ ...S.btnEdit, padding: '4px 8px' }} onClick={() => moveField(idx, 1)} disabled={idx === cfg.fields.length - 1}>▼</button>
                    <button style={S.btnEdit} onClick={() => setEditFieldIdx(idx)}>✏️</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <button style={{ ...S.btnNav, width: '100%', marginTop: 8, border: '2px dashed var(--gray-300)', color: 'var(--gray-500)' }}
          onClick={addField}>+ הוסף שדה חדש</button>
      </div>

      {/* Preview */}
      <div style={S.adminCard}>
        <button style={{ ...S.btnNav, width: '100%', marginBottom: preview ? 16 : 0 }} onClick={() => setPreview(p => !p)}>
          {preview ? '🙈 הסתר תצוגה מקדימה' : '👁️ תצוגה מקדימה'}
        </button>
        {preview && (
          <div style={{ border: '2px solid var(--gray-200)', borderRadius: 16, overflow: 'hidden', transform: 'scale(0.85)', transformOrigin: 'top center' }}>
            <LoginScreen onLogin={() => {}} onAdmin={() => {}} onStaff={() => {}} colleges={colleges} loginConfig={cfg} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ ...S.btnNav, ...S.btnGreen, flex: 2 }} onClick={save}>💾 שמור שינויים</button>
        <button style={{ ...S.btnNav, flex: 1, fontSize: 12 }} onClick={reset}>↩️ איפוס</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--gray-400)', textAlign: 'center', marginTop: 8 }}>השינויים נשמרים לצמיתות ולא יאופסו</p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  SHARED COMPONENTS
// ══════════════════════════════════════════════════════════════
function TopBar({ title, sub, onExit, exitLabel, extra }) {
  return (
    <div style={S.topbar}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: '#93c5fd' }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{extra}
        <button style={S.btnExit} onClick={onExit}>{exitLabel}</button>
      </div>
    </div>
  )
}

function ProgressBar({ pct, left, right }) {
  return (
    <div style={{ background: 'white', padding: '12px 16px', borderBottom: '1px solid var(--gray-200)' }}>
      <div style={{ background: 'var(--gray-200)', borderRadius: 99, height: 6 }}>
        <div style={{ background: 'var(--blue-light)', borderRadius: 99, height: 6, width: pct + '%', transition: 'width 0.4s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>
        <span>{left}</span><span>{right}</span>
      </div>
    </div>
  )
}

function QuestionCard({ q, letters, sel, revealed, onAnswer }) {
  return (
    <div style={S.qCard}>
      <span style={S.qBadge}>שאלה {q.id}</span>
      <p style={S.qText}>{q.question}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        {letters.map(l => {
          let extra = {}
          if (revealed) {
            if (l === q.answer) extra = S.optCorrect
            else if (l === sel && l !== q.answer) extra = S.optWrong
            else if (l !== sel) extra = S.optNeutral
          } else if (l === sel) extra = S.optSelected
          return (
            <div key={l} style={{ ...S.option, ...extra }} onClick={() => onAnswer(l)}>
              <div style={{ ...S.optLetter, ...(l === sel && !revealed ? S.optLetterSel : {}), ...(revealed && l === q.answer ? { background: 'var(--green)', color: 'white' } : {}), ...(revealed && l === sel && l !== q.answer ? { background: 'var(--red)', color: 'white' } : {}) }}>{l}</div>
              <div style={{ flex: 1, fontSize: 14, lineHeight: 1.5 }}>{q.options[l]}</div>
              {revealed && l === q.answer && <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓</span>}
              {revealed && l === sel && l !== q.answer && <span style={{ color: 'var(--red)', fontWeight: 700 }}>✗</span>}
            </div>
          )
        })}
      </div>
      {revealed && !q.answer && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginTop: 12 }}>
          ⚠️ תשובה נכונה לא הוגדרה לשאלה זו
        </div>
      )}
    </div>
  )
}

function NavRow({ onPrev, prevDisabled, onNext, nextDisabled, nextLabel, nextStyle, extraBtn }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
      <button style={{ ...S.btnNav, ...(prevDisabled ? { opacity: 0.3 } : {}) }} onClick={onPrev} disabled={prevDisabled}>← קודם</button>
      {extraBtn || <button style={{ ...S.btnNav, ...nextStyle, ...(nextDisabled ? { opacity: 0.3 } : {}) }} onClick={onNext} disabled={nextDisabled}>{nextLabel}</button>}
    </div>
  )
}

function Modal({ title, body, confirmLabel, cancelLabel, onConfirm, onCancel, danger }) {
  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
        <p style={{ color: 'var(--gray-400)', fontSize: 14, marginBottom: 24 }}>{body}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button style={{ ...S.btnNav, background: danger ? 'var(--red)' : 'var(--blue)', color: 'white', border: 'none' }} onClick={onConfirm}>{confirmLabel}</button>
          <button style={S.btnNav} onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  ROOT APP
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState('login')
  const [user, setUser] = useState(null)
  const [currentStaff, setCurrentStaff] = useState(null)
  const [questions, setQuestions] = useState(QUESTIONS_RAW)
  const [colleges, setColleges] = useState(DEFAULT_COLLEGES)
  const [participants, setParticipants] = useState([])
  const [visitors, setVisitors] = useState([])
  const [staff, setStaff] = useState([])
  const [pendingChanges, setPendingChanges] = useState([])
  const [changeHistory, setChangeHistory] = useState([])
  const [loginConfig, setLoginConfig] = useState(DEFAULT_LOGIN_CONFIG)
  const [history, setHistory] = useState([])
  const [examResult, setExamResult] = useState(null)

  useEffect(() => {
    loadSavedData(QUESTIONS_RAW).then(d => {
      setQuestions(d.questions)
      setColleges(d.colleges)
      setParticipants(d.participants)
      setVisitors(d.visitors)
      setStaff(d.staff)
      setPendingChanges(d.pendingChanges)
      setChangeHistory(d.changeHistory)
      setLoginConfig(d.loginConfig)
    })
  }, [])

  function updateQuestion(id, data) {
    setQuestions(prev => {
      const next = prev.map(q => {
        if (q.id !== id) return q
        if (typeof data === 'string') return { ...q, answer: data || null, editedAt: nowStr() }
        return { ...q, ...data, editedAt: nowStr() }
      })
      persistQuestions(next)
      return next
    })
  }

  function addQuestion(data) {
    setQuestions(prev => {
      const id = data.id || (prev.reduce((m, q) => Math.max(m, typeof q.id === 'number' ? q.id : 0), 0) + 1)
      const newQ = { ...data, id, custom: true }
      const next = [...prev, newQ]
      persistQuestions(next)
      return next
    })
  }

  function deleteQuestion(id) {
    setQuestions(prev => {
      const next = prev.filter(q => q.id !== id)
      persistQuestions(next)
      return next
    })
  }

  function updateColleges(next) { setColleges(next); ss('colleges', next, true) }
  function updateStaff(next) { setStaff(next); ss('staff', next, true) }
  function updateLoginConfig(cfg) { setLoginConfig(cfg); ss('loginConfig', cfg, true) }

  async function handleExamFinish(result) {
    const entry = { ...result, tz: user.tz, first: user.first || '', last: user.last || '', college: user.college || '' }
    setExamResult(result)
    setHistory(h => [result, ...h])
    setScreen('result')
    // Update participants
    const all = (await sg('participants', true)) || []
    const idx = all.findIndex(p => p.tz === entry.tz)
    const rec = { date: entry.date, correct: entry.correct, total: entry.total, passed: entry.passed }
    if (idx >= 0) all[idx].exams = [...(all[idx].exams || []), rec]
    else all.push({ tz: entry.tz, first: entry.first, last: entry.last, college: entry.college, exams: [rec] })
    await ss('participants', all, true)
    setParticipants(all)
    // Update visitor record with exam result
    const allV = (await sg('visitors', true)) || []
    const vi = allV.findIndex(v => v.tz === entry.tz && !v.exam)
    if (vi >= 0) allV[vi].exam = rec
    await ss('visitors', allV, true)
    setVisitors(allV)
  }

  function deleteParticipant(tz) {
    const next = participants.filter(p => p.tz !== tz)
    setParticipants(next)
    ss('participants', next, true)
  }

  function handleStaffSubmit(change) {
    const next = [...pendingChanges, change]
    setPendingChanges(next)
    ss('pendingChanges', next, true)
  }

  function handleApprove(change) {
    if (change.type === 'add') addQuestion(change.data)
    else if (change.type === 'edit') updateQuestion(change.originalId, change.data)
    else if (change.type === 'delete') deleteQuestion(change.originalId)
    const updated = { ...change, status: 'approved', adminName: 'מנהל', resolvedAt: nowStr() }
    const nextPending = pendingChanges.map(c => c.id === change.id ? updated : c)
    const nextHistory = [...changeHistory, updated]
    setPendingChanges(nextPending); ss('pendingChanges', nextPending, true)
    setChangeHistory(nextHistory); ss('changeHistory', nextHistory, true)
  }

  function handleReject(change) {
    const updated = { ...change, status: 'rejected', adminName: 'מנהל', resolvedAt: nowStr() }
    const nextPending = pendingChanges.map(c => c.id === change.id ? updated : c)
    const nextHistory = [...changeHistory, updated]
    setPendingChanges(nextPending); ss('pendingChanges', nextPending, true)
    setChangeHistory(nextHistory); ss('changeHistory', nextHistory, true)
  }

  async function handleUserLogin(u) {
    setUser(u)
    setHistory([])
    setScreen('menu')
    // Track visitor
    const allVisitors = (await sg('visitors', true)) || []
    const rec = { tz: u.tz || `anon_${Date.now()}`, name: `${u.first || ''} ${u.last || ''}`.trim(), college: u.college || '', loginAt: nowStr(), exam: null }
    allVisitors.unshift(rec)
    const trimmed = allVisitors.slice(0, 1000) // keep last 1000
    await ss('visitors', trimmed, true)
    setVisitors(trimmed)
  }

  if (screen === 'login') return <LoginScreen onLogin={handleUserLogin} onAdmin={() => setScreen('admin-login')} onStaff={() => setScreen('staff-login')} colleges={colleges} loginConfig={loginConfig} />
  if (screen === 'admin-login') return <AdminLoginScreen onLogin={() => setScreen('admin')} onBack={() => setScreen('login')} />
  if (screen === 'staff-login') return <StaffLoginScreen staff={staff} onLogin={m => { setCurrentStaff(m); setScreen('staff') }} onBack={() => setScreen('login')} />
  if (screen === 'staff') return <StaffPanel staffMember={currentStaff} questions={questions} onSubmitChange={handleStaffSubmit} onExit={() => { setCurrentStaff(null); setScreen('login') }} />
  if (screen === 'admin') return (
    <AdminPanel
      questions={questions} onUpdate={updateQuestion} onAdd={addQuestion} onDelete={deleteQuestion}
      colleges={colleges} onCollegesChange={updateColleges}
      participants={participants} onDeleteParticipant={deleteParticipant}
      visitors={visitors}
      staff={staff} onStaffChange={updateStaff}
      pendingChanges={pendingChanges} onApprove={handleApprove} onReject={handleReject}
      changeHistory={changeHistory}
      loginConfig={loginConfig} onLoginConfigChange={updateLoginConfig}
      onExit={() => setScreen('login')}
    />
  )
  if (screen === 'menu') return <MenuScreen user={user} onSelect={setScreen} onLogout={() => { setUser(null); setScreen('login') }} history={history} />
  if (screen === 'practice') return <PracticeScreen questions={questions} onExit={() => setScreen('menu')} />
  if (screen === 'exam') return <ExamScreen questions={questions} onFinish={handleExamFinish} onExit={() => setScreen('menu')} />
  if (screen === 'result') return <ResultScreen result={examResult} onBack={() => setScreen('menu')} />
  return null
}

// ══════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════
const S = {
  screen: { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--gray-50)' },
  container: { maxWidth: 640, margin: '0 auto', padding: '20px 16px', flex: 1 },
  loginBg: { minHeight: '100vh', background: 'linear-gradient(135deg,#1e3a8a 0%,#1e40af 50%,#2563eb 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  loginCard: { background: 'white', borderRadius: 24, padding: '40px 32px', width: '100%', maxWidth: 420, boxShadow: '0 25px 60px rgba(0,0,0,0.3)' },
  loginLogo: { textAlign: 'center', marginBottom: 28 },
  loginTitle: { fontSize: 26, fontWeight: 800, color: '#1e3a8a' },
  loginSub: { fontSize: 14, color: 'var(--gray-400)', marginTop: 4 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  formGroup: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 },
  input: { width: '100%', border: '2px solid var(--gray-200)', borderRadius: 12, padding: '12px 14px', fontFamily: 'inherit', fontSize: 14, color: 'var(--gray-800)', background: 'white', outline: 'none', direction: 'rtl', textAlign: 'right', unicodeBidi: 'plaintext' },
  errBox: { background: '#fef2f2', color: 'var(--red)', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 14, border: '1px solid #fecaca' },
  btnPrimary: { width: '100%', background: 'var(--blue)', color: 'white', border: 'none', borderRadius: 14, padding: 15, fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  adminLink: { background: 'none', border: 'none', color: 'var(--gray-400)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' },
  topbar: { background: '#1e3a8a', color: 'white', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 120 },
  stickyUnderTop: { position: 'sticky', top: 62, zIndex: 110 },
  btnExit: { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  pill: { padding: '5px 12px', borderRadius: 99, fontSize: 13, fontWeight: 700 },
  sectionTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--gray-800)' },
  menuCard: { background: 'white', borderRadius: 20, padding: 24, border: '2px solid var(--gray-200)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14 },
  menuCardHover: { borderColor: 'var(--blue-light)', boxShadow: '0 4px 20px rgba(59,130,246,0.12)', transform: 'translateY(-2px)' },
  histRow: { background: 'white', borderRadius: 12, padding: '14px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--gray-200)' },
  qCard: { background: 'white', borderRadius: 20, padding: 24, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  qBadge: { background: 'var(--blue-pale)', color: 'var(--blue)', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 99, display: 'inline-block', marginBottom: 14 },
  qText: { fontSize: 16, lineHeight: 1.7, color: 'var(--gray-800)', fontWeight: 500 },
  option: { border: '2px solid var(--gray-200)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 },
  optSelected: { borderColor: 'var(--blue-light)', background: 'var(--blue-pale)' },
  optCorrect: { borderColor: 'var(--green)', background: '#ecfdf5', pointerEvents: 'none' },
  optWrong: { borderColor: 'var(--red)', background: '#fef2f2', pointerEvents: 'none' },
  optNeutral: { opacity: 0.4, pointerEvents: 'none' },
  optLetter: { width: 34, height: 34, borderRadius: '50%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 },
  optLetterSel: { background: 'var(--blue-light)', color: 'white' },
  btnNav: { border: '2px solid var(--gray-200)', borderRadius: 14, padding: 14, fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: 'white', color: 'var(--gray-800)' },
  btnBlue: { background: 'var(--blue)', color: 'white', border: '2px solid var(--blue)' },
  btnGreen: { background: 'var(--green)', color: 'white', border: '2px solid var(--green)' },
  examGrid: { display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px 16px 10px', background: 'white', borderBottom: '1px solid var(--gray-200)' },
  dot: { width: 28, height: 28, borderRadius: 6, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  resultCard: { background: 'white', borderRadius: 24, padding: '40px 32px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' },
  resultGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 },
  resultBox: { borderRadius: 14, padding: '18px 12px' },
  reqBox: { background: 'var(--gray-100)', borderRadius: 10, padding: 12, fontSize: 13, color: 'var(--gray-600)', marginBottom: 24 },
  adminLoginBg: { minHeight: '100vh', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  adminLoginCard: { background: '#1f2937', borderRadius: 20, padding: '36px 32px', maxWidth: 380, width: '100%' },
  adminInput: { width: '100%', background: '#374151', border: '2px solid #4b5563', borderRadius: 12, padding: 14, color: 'white', fontFamily: 'inherit', fontSize: 15, outline: 'none', marginBottom: 16, direction: 'rtl', textAlign: 'right' },
  btnBack: { width: '100%', background: 'transparent', border: '2px solid #4b5563', color: '#9ca3af', borderRadius: 12, padding: 12, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', marginTop: 8 },
  adminBar: { background: '#1f2937', color: 'white', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 120 },
  adminTabs: { display: 'flex', background: '#111827', borderBottom: '2px solid #374151', position: 'sticky', top: 62, zIndex: 110 },
  adminCard: { background: 'white', borderRadius: 16, padding: 20, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  adminCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  qNum: { background: 'var(--gray-100)', color: 'var(--gray-600)', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 99 },
  ansBadge: { fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 99 },
  ansBadgeGreen: { background: '#ecfdf5', color: 'var(--green)' },
  ansBadgeYellow: { background: '#fffbeb', color: '#92400e' },
  btnEdit: { background: 'var(--blue-pale)', color: 'var(--blue)', border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  adminQText: { fontSize: 14, lineHeight: 1.6, color: 'var(--gray-700)', marginBottom: 12 },
  adminOpts: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  adminOpt: { fontSize: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--gray-200)', background: 'var(--gray-50)' },
  adminOptCorrect: { background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46', fontWeight: 600 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: 'white', borderRadius: 20, padding: 32, maxWidth: 380, width: '100%', textAlign: 'center' },
}
