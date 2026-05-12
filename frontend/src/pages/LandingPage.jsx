import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, ArrowRight, Lock } from 'lucide-react'
import { SplineSceneBasic } from '@/components/ui/spline-scene-demo'

const TERMINAL_LINES = [
  { delay: 500,  text: '> Инициализация KENCE.ai v2.0...',          color: '#57C5B6' },
  { delay: 1200, text: '> Загрузка векторной БД ChromaDB...',      color: '#94a3b8' },
  { delay: 1900, text: '> Подключение к Ollama LLM...',            color: '#94a3b8' },
  { delay: 2500, text: '✓ Модель готова к работе',                 color: '#4ade80' },
  { delay: 3200, text: '> Docling parser: активен',                color: '#94a3b8' },
  { delay: 3800, text: '> RAG pipeline: инициализирован',          color: '#94a3b8' },
  { delay: 4400, text: '✓ Система готова. Ожидание документа...', color: '#57C5B6' },
]

const FEATURES = [
  { icon: '📄', label: 'RAG-чат по документу',  desc: '50+ форматов, точный поиск по тексту' },
  { icon: '🌐', label: 'Перевод KZ / RU / EN',  desc: 'Мгновенный перевод через локальный LLM' },
  { icon: '⚖️', label: 'Сравнение документов',  desc: 'Смысловой, технический и побуквенный diff' },
  { icon: '📊', label: 'Генерация презентации', desc: 'Автоматически в формат PPTX' },
  { icon: '🔄', label: 'Конвертация форматов',  desc: 'PDF → TXT, Markdown, DOCX за секунды' },
]

const STATS = [
  { value: 50, suffix: '+', label: 'форматов' },
  { value: 2,  suffix: 'с', label: 'ответ LLM' },
  { value: 99, suffix: '%', label: 'точность' },
  { value: 3,  suffix: '',  label: 'языка' },
]

function AnimatedCounter({ target, suffix, duration = 1600 }) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStarted(true) }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    const start = performance.now()
    let raf
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [started, target, duration])

  return <span ref={ref}>{count}{suffix}</span>
}

function TerminalLog() {
  const [lines, setLines] = useState([])
  const [cursor, setCursor] = useState(true)
  const bodyRef = useRef(null)

  useEffect(() => {
    const timers = TERMINAL_LINES.map(({ delay, text, color }) =>
      setTimeout(() => setLines(prev => [...prev, { text, color }]), delay)
    )
    const blink = setInterval(() => setCursor(c => !c), 530)
    return () => { timers.forEach(clearTimeout); clearInterval(blink) }
  }, [])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [lines])

  return (
    <div className="lp-terminal">
      <div className="lp-terminal__bar">
        <span className="lp-dot lp-dot--r" /><span className="lp-dot lp-dot--y" /><span className="lp-dot lp-dot--g" />
        <span className="lp-dot-label">KENCE.ai · System Monitor</span>
      </div>
      <div className="lp-terminal__body" ref={bodyRef}>
        {lines.map((ln, i) => (
          <motion.div key={i} className="lp-tline" style={{ color: ln.color }}
            initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
            {ln.text}
          </motion.div>
        ))}
        <span style={{ color: '#57C5B6', opacity: cursor ? 1 : 0 }}>█</span>
      </div>
      <div className="lp-progress">
        <div className="lp-progress__labels"><span>Система</span><span style={{ color: '#4ade80' }}>АКТИВНА</span></div>
        <div className="lp-progress__track">
          <motion.div className="lp-progress__fill"
            initial={{ width: 0 }} animate={{ width: '100%' }}
            transition={{ duration: 5, ease: 'easeOut', delay: 0.4 }} />
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const navigate  = useNavigate()
  const sessionId = useRef(Math.random().toString(36).slice(2, 8).toUpperCase())

  return (
    <div className="lp-root">

      {/* ── Security header ── */}
      <div className="lp-header">
        <div className="lp-header__left">
          <Lock size={11} />
          <span>Локальная обработка · Данные не покидают сервер · Ollama on-premise</span>
        </div>
        <div className="lp-header__right">
          <span className="lp-classify">DEMO</span>
          <span className="lp-sid">SID: #{sessionId.current}</span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="lp-body">

        {/* Left: robot + terminal */}
        <div className="lp-robot-side">
          <SplineSceneBasic />
          <TerminalLog />
        </div>

        {/* Right: hero */}
        <motion.div className="lp-content"
          initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}>

          <div className="lp-badge">
            <span className="lp-badge__dot" />
            AI · Document Intelligence
          </div>

          <h1 className="lp-title">KENCE.ai</h1>
          <p className="lp-subtitle">
            Интеллектуальный анализ документов для госслужащих.<br />
            Быстро. Точно. Локально.
          </p>

          <div className="lp-features">
            {FEATURES.map((f, i) => (
              <motion.div key={i} className="lp-feature"
                initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18 + i * 0.09, duration: 0.28 }}>
                <span className="lp-feature__icon">{f.icon}</span>
                <div>
                  <div className="lp-feature__label">{f.label}</div>
                  <div className="lp-feature__desc">{f.desc}</div>
                </div>
                <span className="lp-feature__check">✓</span>
              </motion.div>
            ))}
          </div>

          <motion.button className="lp-cta"
            onClick={() => navigate('/upload')}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.3 }}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            Начать работу
            <ArrowRight size={18} />
          </motion.button>

          <p className="lp-hint">PDF · DOCX · PPTX · XLSX · PNG · JPG и другие форматы</p>
        </motion.div>
      </div>

      {/* ── Stats bar ── */}
      <div className="lp-stats">
        {STATS.map((s, i) => (
          <div key={i} className="lp-stat">
            <div className="lp-stat__val"><AnimatedCounter target={s.value} suffix={s.suffix} /></div>
            <div className="lp-stat__lbl">{s.label}</div>
          </div>
        ))}
        <div className="lp-stat lp-stat--sec">
          <Shield size={14} style={{ color: '#57C5B6', flexShrink: 0 }} />
          <div className="lp-stat__lbl">Ollama · ChromaDB · Docker isolated</div>
        </div>
      </div>

    </div>
  )
}
