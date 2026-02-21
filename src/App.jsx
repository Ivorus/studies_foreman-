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
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── storage helpers ───────────────────────────────────────────
async function loadSavedData(base) {
  let questions = [...base]
  let colleges = DEFAULT_COLLEGES
  let participants = []
  try {
    const ra = await window.storage.get('q_answers')
    if (ra?.value) {
      const map = JSON.parse(ra.value)
      questions = questions.map(q => ({ ...q, answer: map[q.id] !== undefined ? (map[q.id] || null) : q.answer }))
    }
    const rc = await window.storage.get('q_custom')
    if (rc?.value) questions = [...questions, ...JSON.parse(rc.value)]
    const rcol = await window.storage.get('colleges')
    if (rcol?.value) colleges = JSON.parse(rcol.value)
    const rp = await window.storage.get('participants', true)
    if (rp?.value) participants = JSON.parse(rp.value)
  } catch (_) {}
  return { questions, colleges, participants }
}

async function persistAll(questions) {
  const map = {}
  questions.forEach(q => { map[q.id] = q.answer || null })
  try { await window.storage.set('q_answers', JSON.stringify(map)) } catch (_) {}
  const custom = questions.filter(q => q.custom === true)
  try { await window.storage.set('q_custom', JSON.stringify(custom)) } catch (_) {}
}

async function persistColleges(colleges) {
  try { await window.storage.set('colleges', JSON.stringify(colleges)) } catch (_) {}
}

async function persistParticipant(entry) {
  // entry: { tz, first, last, college, date, correct, total, passed }
  try {
    let all = []
    try {
      const r = await window.storage.get('participants', true)
      if (r?.value) all = JSON.parse(r.value)
    } catch (_) {}
    // update existing or push
    const idx = all.findIndex(p => p.tz === entry.tz)
    if (idx >= 0) {
      all[idx].exams = [...(all[idx].exams || []), { date: entry.date, correct: entry.correct, total: entry.total, passed: entry.passed }]
    } else {
      all.push({ tz: entry.tz, first: entry.first, last: entry.last, college: entry.college, exams: [{ date: entry.date, correct: entry.correct, total: entry.total, passed: entry.passed }] })
    }
    await window.storage.set('participants', JSON.stringify(all), true)
  } catch (_) {}
}

async function deleteParticipant(tz) {
  try {
    const r = await window.storage.get('participants', true)
    if (!r?.value) return
    const all = JSON.parse(r.value).filter(p => p.tz !== tz)
    await window.storage.set('participants', JSON.stringify(all), true)
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin, onAdmin, colleges }) {
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [tz, setTz] = useState('')
  const [college, setCollege] = useState('')
  const [err, setErr] = useState('')

  function submit() {
    if (!first.trim() || !last.trim()) return setErr('נא להזין שם פרטי ושם משפחה')
    if (!/^\d{9}$/.test(tz)) return setErr('תעודת זהות חייבת להכיל 9 ספרות בדיוק')
    if (!college) return setErr('נא לבחור מכללה')
    setErr('')
    onLogin({ first, last, tz, college })
  }

  return (
    <div style={S.loginBg}>
      <div style={S.loginCard}>
        <div style={S.loginLogo}>
          <span style={{ fontSize: 56 }}>🏗️</span>
          <h1 style={S.loginTitle}>מנהל עבודה בניין</h1>
          <p style={S.loginSub}>מערכת הכנה לבחינות</p>
        </div>

        <div style={S.row2}>
          <Field label="שם פרטי" value={first} onChange={setFirst} placeholder="שם פרטי" />
          <Field label="שם משפחה" value={last} onChange={setLast} placeholder="שם משפחה" />
        </div>
        <Field label="תעודת זהות" value={tz} onChange={v => setTz(v.replace(/\D/g, ''))} placeholder="9 ספרות" maxLength={9} inputMode="numeric" />

        <div style={S.formGroup}>
          <label style={S.label}>מכללה</label>
          <select style={S.input} value={college} onChange={e => setCollege(e.target.value)}>
            <option value="">-- בחר מכללה --</option>
            {colleges.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {err && <div style={S.errBox}>{err}</div>}

        <button style={S.btnPrimary} onClick={submit}>כניסה למערכת ←</button>
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button style={S.adminLink} onClick={onAdmin}>כניסת מנהל מערכת</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, maxLength, inputMode }) {
  return (
    <div style={S.formGroup}>
      <label style={S.label}>{label}</label>
      <input
        style={S.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  MENU
// ════════════════════════════════════════════════════════════════
function MenuScreen({ user, onSelect, onLogout, history }) {
  return (
    <div style={S.screen}>
      <TopBar title={`שלום, ${user.first} ${user.last}`} sub={user.college} onExit={onLogout} exitLabel="יציאה" />
      <div style={S.container}>
        <h2 style={S.sectionTitle}>בחר סוג פעילות</h2>

        <MenuCard icon="📚" title="תרגול" desc="ענה על שאלות בקצב שלך — תשובה נכונה מוצגת מיד" onClick={() => onSelect('practice')} />
        <MenuCard icon="📝" title="מבחן" desc={`${EXAM_COUNT} שאלות | נדרש ${PASS_SCORE} נכון לפחות (עד ${EXAM_COUNT - PASS_SCORE} טעויות)`} onClick={() => onSelect('exam')} />

        {history.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <h3 style={{ ...S.sectionTitle, fontSize: 15, marginBottom: 10 }}>היסטוריית מבחנים</h3>
            {history.map((r, i) => (
              <div key={i} style={{ ...S.histRow, borderRight: `4px solid ${r.passed ? 'var(--green)' : 'var(--red)'}` }}>
                <div>
                  <div style={{ fontWeight: 700, color: r.passed ? 'var(--green)' : 'var(--red)' }}>
                    {r.passed ? '✅ עבר' : '❌ לא עבר'}
                  </div>
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
    <div
      style={{ ...S.menuCard, ...(hover ? S.menuCardHover : {}) }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={{ fontSize: 42 }}>{icon}</span>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>{desc}</p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  PRACTICE
// ════════════════════════════════════════════════════════════════
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

  function nav(dir) {
    setIdx(i => Math.max(0, Math.min(qs.length - 1, i + dir)))
  }

  const pct = ((idx + 1) / qs.length * 100).toFixed(0)

  return (
    <div style={S.screen}>
      <TopBar title="📚 תרגול" onExit={onExit} exitLabel="תפריט ראשי" />
      <ProgressBar pct={pct} left={`שאלה ${idx + 1} מתוך ${qs.length}`} right={`${correct} נכון`} />
      <div style={S.container}>
        <QuestionCard q={q} letters={letters} sel={sel} revealed={revealed} onAnswer={answer} />
        <NavRow
          onPrev={() => nav(-1)} prevDisabled={idx === 0}
          onNext={() => nav(1)} nextDisabled={idx === qs.length - 1}
          nextLabel="הבא →" nextStyle={S.btnBlue}
        />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  EXAM
// ════════════════════════════════════════════════════════════════
function ExamScreen({ questions, onFinish, onExit }) {
  const [qs] = useState(() => shuffle(questions).slice(0, Math.min(EXAM_COUNT, questions.length)))
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [showExitModal, setShowExitModal] = useState(false)

  const q = qs[idx]
  const sel = answers[idx]
  const letters = LETTERS.filter(l => q.options[l])

  const countCorrect = Object.entries(answers).filter(([i, a]) => a === qs[+i].answer).length
  const countWrong = Object.keys(answers).length - countCorrect

  function answer(letter) {
    setAnswers(a => ({ ...a, [idx]: letter }))
  }

  function nav(dir) {
    setIdx(i => Math.max(0, Math.min(qs.length - 1, i + dir)))
  }

  function finish() {
    let correct = 0
    qs.forEach((q, i) => { if (answers[i] === q.answer) correct++ })
    onFinish({ correct, total: qs.length, passed: correct >= PASS_SCORE, date: new Date().toLocaleDateString('he-IL') })
  }

  const isLast = idx === qs.length - 1

  return (
    <div style={S.screen}>
      <TopBar
        title="📝 מבחן"
        onExit={() => setShowExitModal(true)}
        exitLabel="יציאה"
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ ...S.pill, background: '#dcfce7', color: 'var(--green)' }}>{countCorrect} ✓</span>
            <span style={{ ...S.pill, background: '#fee2e2', color: 'var(--red)' }}>{countWrong} ✗</span>
          </div>
        }
      />

      {/* mini grid */}
      <div style={S.examGrid}>
        {qs.map((q, i) => {
          const a = answers[i]
          let bg = '#f1f5f9', color = '#94a3b8'
          if (i === idx) { bg = 'var(--blue-dark)'; color = 'white' }
          else if (a !== undefined) {
            if (a === q.answer) { bg = 'var(--green)'; color = 'white' }
            else { bg = 'var(--red)'; color = 'white' }
          }
          return (
            <button key={i} style={{ ...S.dot, background: bg, color }}
              onClick={() => setIdx(i)}>{i + 1}</button>
          )
        })}
      </div>

      <div style={S.container}>
        <QuestionCard q={q} letters={letters} sel={sel} revealed={false} onAnswer={answer} />
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--gray-400)', margin: '10px 0' }}>
          ענית על {Object.keys(answers).length} מתוך {qs.length} שאלות
        </p>
        <NavRow
          onPrev={() => nav(-1)} prevDisabled={idx === 0}
          onNext={isLast ? null : () => nav(1)} nextLabel="הבא →" nextStyle={S.btnBlue}
          extraBtn={isLast ? <button style={{ ...S.btnNav, ...S.btnGreen, flex: 1 }} onClick={finish}>סיים מבחן ✓</button> : null}
        />
      </div>

      {showExitModal && (
        <Modal
          title="לצאת מהמבחן?"
          body="ההתקדמות שלך לא תישמר"
          confirmLabel="יציאה"
          cancelLabel="המשך"
          onConfirm={onExit}
          onCancel={() => setShowExitModal(false)}
          danger
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  RESULT
// ════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════
//  ADMIN LOGIN
// ════════════════════════════════════════════════════════════════
function AdminLoginScreen({ onLogin, onBack }) {
  const [pass, setPass] = useState('')
  const [err, setErr] = useState(false)
  function check() {
    if (pass === ADMIN_PASS) { setErr(false); onLogin() }
    else setErr(true)
  }
  return (
    <div style={S.adminLoginBg}>
      <div style={S.adminLoginCard}>
        <h2 style={{ color: 'white', textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>⚙️ כניסת מנהל</h2>
        <input
          type="password"
          style={S.adminInput}
          placeholder="סיסמה"
          value={pass}
          onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && check()}
        />
        {err && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>סיסמה שגויה</p>}
        <button style={{ ...S.btnPrimary, marginBottom: 10 }} onClick={check}>כניסה</button>
        <button style={S.btnBack} onClick={onBack}>חזרה</button>
        <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: 14 }}>סיסמה ברירת מחדל: admin123</p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  ADMIN PANEL
// ════════════════════════════════════════════════════════════════
const EMPTY_FORM = { question: '', א: '', ב: '', ג: '', ד: '', answer: '' }

function qToForm(q) {
  return {
    question: q.question || '',
    'א': q.options?.['א'] || '',
    'ב': q.options?.['ב'] || '',
    'ג': q.options?.['ג'] || '',
    'ד': q.options?.['ד'] || '',
    answer: q.answer || '',
  }
}

// Shared form for both adding and editing a question
function QuestionForm({ initial = EMPTY_FORM, onSave, onCancel, saveLabel = 'שמור', title }) {
  const [form, setForm] = useState(initial)
  const [err, setErr] = useState('')

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val }
      // clear answer if that option was emptied
      if (LETTERS.includes(key) && !val.trim() && f.answer === key) next.answer = ''
      return next
    })
  }

  function submit() {
    if (!form.question.trim()) return setErr('נא להזין טקסט שאלה')
    if (!form['א'].trim() || !form['ב'].trim()) return setErr('חובה למלא לפחות תשובות א ו-ב')
    if (!form.answer) return setErr('נא לבחור תשובה נכונה')
    setErr('')
    onSave({
      question: form.question.trim(),
      options: Object.fromEntries(
        LETTERS.filter(l => form[l].trim()).map(l => [l, form[l].trim()])
      ),
      answer: form.answer,
    })
  }

  return (
    <div style={S.adminCard}>
      {title && <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 18, color: 'var(--gray-800)' }}>{title}</h3>}

      {/* Question text */}
      <div style={S.formGroup}>
        <label style={S.label}>טקסט השאלה *</label>
        <textarea
          style={{ ...S.input, minHeight: 86, resize: 'vertical', lineHeight: 1.6, direction: 'rtl', textAlign: 'right', unicodeBidi: 'plaintext' }}
          dir="rtl"
          placeholder="הזן את טקסט השאלה כאן..."
          value={form.question}
          onChange={e => set('question', e.target.value)}
        />
      </div>

      {/* Options */}
      <div style={{ background: 'var(--gray-50)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-600)', marginBottom: 12 }}>
          תשובות אפשריות — לחץ על האות לסימון התשובה הנכונה
        </p>
        {LETTERS.map(l => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div
              title="לחץ לסמן כתשובה נכונה"
              style={{
                ...S.optLetter, flexShrink: 0, cursor: 'pointer', transition: 'background 0.15s',
                background: form.answer === l ? 'var(--green)' : form[l].trim() ? 'var(--blue-light)' : 'var(--gray-200)',
                color: form.answer === l || form[l].trim() ? 'white' : 'var(--gray-500)',
              }}
              onClick={() => { if (form[l].trim()) set('answer', l) }}
            >{l}</div>
            <input
              style={{ ...S.input, marginBottom: 0, flex: 1 }}
              placeholder={`תשובה ${l}${l === 'א' || l === 'ב' ? ' *' : ' (אופציונלי)'}`}
              value={form[l]}
              onChange={e => set(l, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* Answer indicator */}
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

function AdminPanel({ questions, onUpdate, onAdd, onDelete, colleges, onCollegesChange, participants, onDeleteParticipant, onExit }) {
  const [tab, setTab] = useState('list')
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState(null)   // full-edit mode
  const [deleteId, setDeleteId] = useState(null)
  const [savedId, setSavedId] = useState(null)  // flash "saved" badge

  const filtered = questions.filter(q =>
    String(q.id).includes(search) || q.question.toLowerCase().includes(search.toLowerCase())
  )

  function handleUpdate(id, data) {
    onUpdate(id, data)
    setEditId(null)
    setSavedId(id)
    setTimeout(() => setSavedId(null), 2500)
  }

  function handleAdd(data) {
    onAdd(data)
    setTab('list')
  }

  const tabStyle = (key) => ({
    flex: 1, padding: '12px 8px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
    border: 'none', cursor: 'pointer',
    background: tab === key ? '#1e40af' : 'transparent',
    color: tab === key ? 'white' : '#9ca3af',
    borderBottom: tab === key ? '3px solid #60a5fa' : '3px solid transparent',
  })

  return (
    <div style={S.screen}>
      <div style={S.adminBar}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>⚙️ פאנל ניהול</span>
        <button style={S.btnExit} onClick={onExit}>יציאה</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#111827', borderBottom: '2px solid #374151', overflowX: 'auto' }}>
        <button style={tabStyle('list')} onClick={() => { setTab('list'); setEditId(null) }}>📋 שאלות ({questions.length})</button>
        <button style={tabStyle('add')} onClick={() => { setTab('add'); setEditId(null) }}>➕ הוסף שאלה</button>
        <button style={tabStyle('participants')} onClick={() => setTab('participants')}>👥 משתתפים ({participants.length})</button>
        <button style={tabStyle('colleges')} onClick={() => setTab('colleges')}>🏫 מוסדות ({colleges.length})</button>
      </div>

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <div style={S.container}>
          <input
            style={{ ...S.input, marginBottom: 16 }}
            placeholder="חפש לפי מספר שאלה או תוכן..."
            value={search}
            onChange={e => { setSearch(e.target.value); setEditId(null) }}
          />

          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>לא נמצאו שאלות</p>
          )}

          {filtered.map(q => {
            const opts = LETTERS.filter(l => q.options?.[l])
            const isCustom = q.custom === true
            const isEditing = editId === q.id
            const wasSaved = savedId === q.id

            return (
              <div key={q.id} style={{
                ...S.adminCard,
                borderRight: isCustom ? '4px solid #a78bfa' : undefined,
                outline: wasSaved ? '2px solid var(--green)' : undefined,
              }}>
                {/* Card header */}
                <div style={S.adminCardHeader}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={S.qNum}>שאלה {q.id}</span>
                    {isCustom && <span style={{ ...S.ansBadge, background: '#ede9fe', color: '#6d28d9' }}>✨ חדש</span>}
                    {wasSaved && <span style={{ ...S.ansBadge, ...S.ansBadgeGreen }}>✅ נשמר</span>}
                    <span style={{ ...S.ansBadge, ...(q.answer ? S.ansBadgeGreen : S.ansBadgeYellow) }}>
                      {q.answer ? `תשובה: ${q.answer}` : 'ללא תשובה'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={{ ...S.btnEdit, ...(isEditing ? { background: '#fef9c3', color: '#92400e', borderColor: '#fde68a' } : {}) }}
                      onClick={() => setEditId(isEditing ? null : q.id)}
                    >
                      {isEditing ? '✕ סגור' : '✏️ ערוך'}
                    </button>
                    <button
                      style={{ ...S.btnEdit, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }}
                      onClick={() => setDeleteId(q.id)}
                    >🗑️</button>
                  </div>
                </div>

                {/* Question preview (collapsed) */}
                {!isEditing && (
                  <>
                    <p style={S.adminQText}>{q.question}</p>
                    <div style={S.adminOpts}>
                      {opts.map(l => (
                        <div key={l} style={{ ...S.adminOpt, ...(q.answer === l ? S.adminOptCorrect : {}) }}>
                          <strong>{l}.</strong> {q.options[l]}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Full edit form (expanded) */}
                {isEditing && (
                  <div style={{ marginTop: 16 }}>
                    <QuestionForm
                      initial={qToForm(q)}
                      onSave={(data) => handleUpdate(q.id, data)}
                      onCancel={() => setEditId(null)}
                      saveLabel="💾 שמור שינויים"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── ADD TAB ── */}
      {tab === 'add' && (
        <div style={S.container}>
          <QuestionForm
            title="➕ הוספת שאלה חדשה"
            onSave={handleAdd}
            saveLabel="הוסף שאלה ←"
          />
        </div>
      )}

      {/* ── PARTICIPANTS TAB ── */}
      {tab === 'participants' && (
        <ParticipantsTab participants={participants} onDelete={onDeleteParticipant} />
      )}

      {/* ── COLLEGES TAB ── */}
      {tab === 'colleges' && (
        <CollegesTab colleges={colleges} onChange={onCollegesChange} />
      )}

      {/* Delete confirm modal */}
      {deleteId !== null && (
        <Modal
          title="למחוק שאלה זו?"
          body="פעולה זו אינה ניתנת לביטול"
          confirmLabel="מחק"
          cancelLabel="ביטול"
          onConfirm={() => { onDelete(deleteId); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
          danger
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  PARTICIPANTS TAB
// ════════════════════════════════════════════════════════════════
function ParticipantsTab({ participants, onDelete }) {
  const [search, setSearch] = useState('')
  const [deleteP, setDeleteP] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const filtered = participants.filter(p =>
    `${p.first} ${p.last} ${p.tz} ${p.college}`.toLowerCase().includes(search.toLowerCase())
  )

  // Sort by last exam date desc
  const sorted = [...filtered].sort((a, b) => {
    const da = a.exams?.[a.exams.length - 1]?.date || ''
    const db = b.exams?.[b.exams.length - 1]?.date || ''
    return db.localeCompare(da)
  })

  function bestScore(p) {
    if (!p.exams?.length) return null
    return p.exams.reduce((best, e) => e.correct > (best?.correct || 0) ? e : best, null)
  }

  return (
    <div style={S.container}>
      {participants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
          <p style={{ color: 'var(--gray-400)', fontSize: 15 }}>עדיין אין משתתפים רשומים</p>
          <p style={{ color: 'var(--gray-400)', fontSize: 13, marginTop: 6 }}>משתתפים יופיעו כאן לאחר שיסיימו מבחן</p>
        </div>
      ) : (
        <>
          <input
            style={{ ...S.input, marginBottom: 16 }}
            placeholder="חפש לפי שם, ת.ז. או מוסד..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 12 }}>
            {sorted.length} משתתפים | סה"כ {participants.reduce((s, p) => s + (p.exams?.length || 0), 0)} מבחנים
          </p>
          {sorted.map(p => {
            const best = bestScore(p)
            const lastExam = p.exams?.[p.exams.length - 1]
            const passCount = (p.exams || []).filter(e => e.passed).length
            const isExpanded = expanded === p.tz
            return (
              <div key={p.tz} style={{ ...S.adminCard, borderRight: `4px solid ${passCount > 0 ? 'var(--green)' : 'var(--red)'}` }}>
                <div style={S.adminCardHeader}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{p.first} {p.last}</span>
                      <span style={{ ...S.ansBadge, background: 'var(--gray-100)', color: 'var(--gray-600)' }}>ת.ז: {p.tz}</span>
                      {passCount > 0
                        ? <span style={{ ...S.ansBadge, ...S.ansBadgeGreen }}>✅ עבר ({passCount})</span>
                        : <span style={{ ...S.ansBadge, ...S.ansBadgeYellow }}>❌ לא עבר</span>
                      }
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                      🏫 {p.college} &nbsp;|&nbsp; 📝 {p.exams?.length || 0} מבחנים
                      {best && <span> &nbsp;|&nbsp; 🏆 שיא: {best.correct}/{best.total}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button style={S.btnEdit} onClick={() => setExpanded(isExpanded ? null : p.tz)}>
                      {isExpanded ? '▲ סגור' : '▼ היסטוריה'}
                    </button>
                    <button style={{ ...S.btnEdit, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }}
                      onClick={() => setDeleteP(p.tz)}>🗑️</button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
                    <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--gray-600)' }}>היסטוריית מבחנים:</p>
                    {(p.exams || []).slice().reverse().map((e, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', borderRadius: 8, marginBottom: 6,
                        background: e.passed ? '#ecfdf5' : '#fef2f2',
                        border: `1px solid ${e.passed ? '#a7f3d0' : '#fecaca'}`
                      }}>
                        <span style={{ fontSize: 13, color: e.passed ? '#065f46' : '#991b1b', fontWeight: 600 }}>
                          {e.passed ? '✅ עבר' : '❌ לא עבר'} — {e.correct}/{e.total}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{e.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
      {deleteP && (
        <Modal
          title="למחוק משתתף זה?"
          body="כל נתוני המבחנים של המשתתף יימחקו"
          confirmLabel="מחק"
          cancelLabel="ביטול"
          onConfirm={() => { onDelete(deleteP); setDeleteP(null) }}
          onCancel={() => setDeleteP(null)}
          danger
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  COLLEGES TAB
// ════════════════════════════════════════════════════════════════
function CollegesTab({ colleges, onChange }) {
  const [editIdx, setEditIdx] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [newVal, setNewVal] = useState('')
  const [err, setErr] = useState('')
  const [deleteIdx, setDeleteIdx] = useState(null)

  function saveEdit() {
    if (!editVal.trim()) return setErr('שם המוסד לא יכול להיות ריק')
    if (colleges.some((c, i) => c === editVal.trim() && i !== editIdx)) return setErr('מוסד בשם זה כבר קיים')
    const next = colleges.map((c, i) => i === editIdx ? editVal.trim() : c)
    onChange(next)
    setEditIdx(null)
    setErr('')
  }

  function addCollege() {
    if (!newVal.trim()) return setErr('נא להזין שם מוסד')
    if (colleges.includes(newVal.trim())) return setErr('מוסד בשם זה כבר קיים')
    onChange([...colleges, newVal.trim()])
    setNewVal('')
    setErr('')
  }

  function deleteCollege(idx) {
    onChange(colleges.filter((_, i) => i !== idx))
    setDeleteIdx(null)
  }

  return (
    <div style={S.container}>
      <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>
        רשימת המוסדות מופיעה לבחירה בטופס ההרשמה של המשתתפים
      </p>

      {colleges.map((c, i) => {
        const isEditing = editIdx === i
        return (
          <div key={i} style={S.adminCard}>
            {isEditing ? (
              <div>
                <input
                  style={{ ...S.input, marginBottom: 10 }}
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && saveEdit()}
                />
                {err && <div style={{ ...S.errBox, marginBottom: 10 }}>{err}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button style={{ ...S.btnNav, ...S.btnGreen, flex: 1 }} onClick={saveEdit}>💾 שמור</button>
                  <button style={{ ...S.btnNav, flex: 1 }} onClick={() => { setEditIdx(null); setErr('') }}>ביטול</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🏫</span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{c}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={S.btnEdit} onClick={() => { setEditIdx(i); setEditVal(c); setErr('') }}>✏️ ערוך</button>
                  <button style={{ ...S.btnEdit, background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }}
                    onClick={() => setDeleteIdx(i)}>🗑️</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add new college */}
      <div style={{ ...S.adminCard, background: 'var(--blue-pale)', border: '2px dashed var(--blue-light)' }}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--blue)' }}>➕ הוסף מוסד חדש</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            style={{ ...S.input, flex: 1, marginBottom: 0 }}
            placeholder="שם המוסד..."
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCollege()}
          />
          <button style={{ ...S.btnNav, ...S.btnBlue, whiteSpace: 'nowrap' }} onClick={addCollege}>הוסף</button>
        </div>
        {err && editIdx === null && <div style={{ ...S.errBox, marginTop: 10 }}>{err}</div>}
      </div>

      {deleteIdx !== null && (
        <Modal
          title="למחוק מוסד זה?"
          body={`"${colleges[deleteIdx]}" יוסר מרשימת הבחירה`}
          confirmLabel="מחק"
          cancelLabel="ביטול"
          onConfirm={() => deleteCollege(deleteIdx)}
          onCancel={() => setDeleteIdx(null)}
          danger
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  SHARED COMPONENTS
// ════════════════════════════════════════════════════════════════
function TopBar({ title, sub, onExit, exitLabel, extra }) {
  return (
    <div style={S.topbar}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: '#93c5fd' }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {extra}
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
          } else if (l === sel) {
            extra = S.optSelected
          }
          return (
            <div key={l} style={{ ...S.option, ...extra }} onClick={() => onAnswer(l)}>
              <div style={{ ...S.optLetter, ...(l === sel && !revealed ? S.optLetterSel : {}), ...(revealed && l === q.answer ? { background: 'var(--green)', color: 'white' } : {}), ...(revealed && l === sel && l !== q.answer ? { background: 'var(--red)', color: 'white' } : {}) }}>
                {l}
              </div>
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
      {extraBtn || (
        <button style={{ ...S.btnNav, ...nextStyle, ...(nextDisabled ? { opacity: 0.3 } : {}) }} onClick={onNext} disabled={nextDisabled}>{nextLabel}</button>
      )}
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

// ════════════════════════════════════════════════════════════════
//  ROOT APP
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState('login')
  const [user, setUser] = useState(null)
  const [questions, setQuestions] = useState(QUESTIONS_RAW)
  const [colleges, setColleges] = useState(DEFAULT_COLLEGES)
  const [participants, setParticipants] = useState([])
  const [history, setHistory] = useState([])
  const [examResult, setExamResult] = useState(null)

  useEffect(() => {
    loadSavedData(QUESTIONS_RAW).then(({ questions, colleges, participants }) => {
      setQuestions(questions)
      setColleges(colleges)
      setParticipants(participants)
    })
  }, [])

  function updateAnswer(id, data) {
    setQuestions(prev => {
      const next = prev.map(q => {
        if (q.id !== id) return q
        if (typeof data === 'string') return { ...q, answer: data || null }
        return { ...q, ...data }
      })
      persistAll(next)
      return next
    })
  }

  function addQuestion({ question, options, answer }) {
    setQuestions(prev => {
      const maxId = prev.reduce((m, q) => Math.max(m, typeof q.id === 'number' ? q.id : 0), 0)
      const newQ = { id: maxId + 1, question, options, answer, custom: true }
      const next = [...prev, newQ]
      persistAll(next)
      return next
    })
  }

  function deleteQuestion(id) {
    setQuestions(prev => {
      const next = prev.filter(q => q.id !== id)
      persistAll(next)
      return next
    })
  }

  function updateColleges(next) {
    setColleges(next)
    persistColleges(next)
  }

  function handleLogin(u) { setUser(u); setHistory([]); setScreen('menu') }
  function handleLogout() { setUser(null); setScreen('login') }

  function handleExamFinish(result) {
    const entry = { ...result, tz: user.tz, first: user.first, last: user.last, college: user.college }
    setExamResult(result)
    setHistory(h => [result, ...h])
    persistParticipant(entry).then(() => {
      // reload participants
      window.storage.get('participants', true).then(r => {
        if (r?.value) setParticipants(JSON.parse(r.value))
      }).catch(() => {})
    })
    setScreen('result')
  }

  function handleDeleteParticipant(tz) {
    deleteParticipant(tz).then(() => {
      setParticipants(prev => prev.filter(p => p.tz !== tz))
    })
  }

  if (screen === 'login') return <LoginScreen onLogin={handleLogin} onAdmin={() => setScreen('admin-login')} colleges={colleges} />
  if (screen === 'admin-login') return <AdminLoginScreen onLogin={() => setScreen('admin')} onBack={() => setScreen('login')} />
  if (screen === 'admin') return <AdminPanel questions={questions} onUpdate={updateAnswer} onAdd={addQuestion} onDelete={deleteQuestion} colleges={colleges} onCollegesChange={updateColleges} participants={participants} onDeleteParticipant={handleDeleteParticipant} onExit={() => setScreen('login')} />
  if (screen === 'menu') return <MenuScreen user={user} onSelect={setScreen} onLogout={handleLogout} history={history} />
  if (screen === 'practice') return <PracticeScreen questions={questions} onExit={() => setScreen('menu')} />
  if (screen === 'exam') return <ExamScreen questions={questions} onFinish={handleExamFinish} onExit={() => setScreen('menu')} />
  if (screen === 'result') return <ResultScreen result={examResult} onBack={() => setScreen('menu')} />
  return null
}

// ════════════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════════════
const S = {
  screen: { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--gray-50)' },
  container: { maxWidth: 640, margin: '0 auto', padding: '20px 16px', flex: 1 },

  // login
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
  adminLink: { background: 'none', border: 'none', color: 'var(--gray-400)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },

  // topbar
  topbar: { background: '#1e3a8a', color: 'white', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 },
  btnExit: { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  pill: { padding: '5px 12px', borderRadius: 99, fontSize: 13, fontWeight: 700 },

  // menu
  sectionTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--gray-800)' },
  menuCard: { background: 'white', borderRadius: 20, padding: 24, border: '2px solid var(--gray-200)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14 },
  menuCardHover: { borderColor: 'var(--blue-light)', boxShadow: '0 4px 20px rgba(59,130,246,0.12)', transform: 'translateY(-2px)' },
  histRow: { background: 'white', borderRadius: 12, padding: '14px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--gray-200)' },

  // question
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

  // nav
  btnNav: { border: '2px solid var(--gray-200)', borderRadius: 14, padding: 14, fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: 'white', color: 'var(--gray-800)' },
  btnBlue: { background: 'var(--blue)', color: 'white', border: '2px solid var(--blue)' },
  btnGreen: { background: 'var(--green)', color: 'white', border: '2px solid var(--green)' },

  // exam grid
  examGrid: { display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px 16px 10px', background: 'white', borderBottom: '1px solid var(--gray-200)' },
  dot: { width: 28, height: 28, borderRadius: 6, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  // result
  resultCard: { background: 'white', borderRadius: 24, padding: '40px 32px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' },
  resultGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 },
  resultBox: { borderRadius: 14, padding: '18px 12px' },
  reqBox: { background: 'var(--gray-100)', borderRadius: 10, padding: 12, fontSize: 13, color: 'var(--gray-600)', marginBottom: 24 },

  // admin
  adminLoginBg: { minHeight: '100vh', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  adminLoginCard: { background: '#1f2937', borderRadius: 20, padding: '36px 32px', maxWidth: 380, width: '100%' },
  adminInput: { width: '100%', background: '#374151', border: '2px solid #4b5563', borderRadius: 12, padding: 14, color: 'white', fontFamily: 'inherit', fontSize: 15, outline: 'none', marginBottom: 16, direction: 'rtl', textAlign: 'right' },
  btnBack: { width: '100%', background: 'transparent', border: '2px solid #4b5563', color: '#9ca3af', borderRadius: 12, padding: 12, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', marginTop: 8 },
  adminBar: { background: '#1f2937', color: 'white', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 },
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
  editPanel: { background: 'var(--blue-pale)', border: '1px solid #bfdbfe', borderRadius: 12, padding: 16, marginTop: 14 },
  letterBtn: { width: 48, height: 48, borderRadius: 12, border: '2px solid var(--gray-300)', background: 'white', fontFamily: 'inherit', fontSize: 18, fontWeight: 700, cursor: 'pointer' },
  letterBtnSel: { background: 'var(--blue)', borderColor: 'var(--blue)', color: 'white' },
  clearBtn: { padding: '0 16px', height: 48, borderRadius: 12, border: '2px solid var(--gray-300)', background: 'white', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', color: 'var(--gray-500)' },

  // modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: 'white', borderRadius: 20, padding: 32, maxWidth: 380, width: '100%', textAlign: 'center' },
}
