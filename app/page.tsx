'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, BarChart, Calendar as CalendarIcon, Settings, ChevronLeft, ChevronRight, Lightbulb, Send, Info, Trash2, ShieldAlert, LogOut, Clock, Cloud, MonitorSmartphone, Loader2 } from 'lucide-react';
import { auth, db, provider, isConfigured } from '@/lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, Timestamp, getDocs } from 'firebase/firestore';

type Mood = 'increible' | 'bien' | 'normal' | 'mal' | 'horrible';
type Energy = 'baja' | 'media' | 'alta';
type View = 'diario' | 'estadisticas' | 'calendario' | 'ajustes';

interface MoodEntry {
  mood: Mood;
  note: string;
  energy: Energy | null;
  word: string;
  timestamp: number;
}

const MOODS: Record<Mood, { emoji: string; label: string; color: string; bg: string; shadow: string }> = {
  increible: { emoji: '😄', label: 'Increíble', color: 'text-tertiary', bg: 'bg-tertiary/20', shadow: 'shadow-[0_0_15px_rgba(255,209,111,0.15)]' },
  bien: { emoji: '😊', label: 'Bien', color: 'text-secondary', bg: 'bg-secondary/20', shadow: 'shadow-[0_0_15px_rgba(52,181,250,0.15)]' },
  normal: { emoji: '😐', label: 'Normal', color: 'text-primary', bg: 'bg-primary/20', shadow: '' },
  mal: { emoji: '😞', label: 'Mal', color: 'text-error-dim', bg: 'bg-error-dim/20', shadow: '' },
  horrible: { emoji: '😢', label: 'Horrible', color: 'text-error', bg: 'bg-error/20', shadow: '' },
};

const ENERGY_COLORS = {
  baja: 'text-outline',
  media: 'text-primary',
  alta: 'text-tertiary'
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => {
  let day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Make Monday = 0
};
const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDateString = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatVisualDate = (dateStr: string) => {
  const date = parseDateString(dateStr);
  const day = date.getDate();
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${day} de ${monthNames[date.getMonth()]}`;
};

export default function MoodLokura() {
  const [mounted, setMounted] = useState(false);
  const [currentView, setCurrentView] = useState<View>('diario');
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date()));
  const [moods, setMoods] = useState<Record<string, MoodEntry>>({});

  // Firebase / Auth State
  const [user, setUser] = useState<User | null>(null);
  const [syncMode, setSyncMode] = useState<'local' | 'cloud'>('local');
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  // Form State
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const [note, setNote] = useState('');
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [word, setWord] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('moodlokura_data');
    if (saved) {
      try {
        setMoods(JSON.parse(saved));
      } catch (e) {
        console.error("Error parsing local storage data", e);
      }
    }

    if (isConfigured && auth) {
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser);
        setIsLoadingAuth(false);
        if (currentUser) {
          setSyncMode('cloud');
          await syncCloudData(currentUser.uid, saved ? JSON.parse(saved) : {});
        } else {
          setSyncMode('local');
        }
      });
      return () => unsubscribe();
    } else {
      setIsLoadingAuth(false);
    }
  }, []);

  const syncCloudData = async (userId: string, localData: Record<string, MoodEntry>) => {
    if (!db) return;
    try {
      const moodsRef = collection(db, 'users', userId, 'moods');
      const snapshot = await getDocs(moodsRef);
      
      const cloudData: Record<string, MoodEntry> = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        cloudData[doc.id] = {
          mood: data.mood,
          note: data.note,
          energy: data.energy,
          word: data.word,
          timestamp: data.timestamp
        };
      });

      // Merge local and cloud data (prefer cloud if same timestamp or newer)
      const mergedData = { ...localData };
      for (const [date, cloudEntry] of Object.entries(cloudData)) {
         mergedData[date] = cloudEntry;
      }

      setMoods(mergedData);
      localStorage.setItem('moodlokura_data', JSON.stringify(mergedData));

      // Push local-only docs to cloud (simple initial sync)
      for (const [date, localEntry] of Object.entries(localData)) {
        if (!cloudData[date]) {
          await setDoc(doc(db, 'users', userId, 'moods', date), localEntry);
        }
      }

    } catch (e) {
      console.error("Error syncing cloud data:", e);
      setFirebaseError("Hubo un problema sincronizando tus datos en la nube.");
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const entry = moods[selectedDate];
    if (entry) {
      setSelectedMood(entry.mood);
      setNote(entry.note);
      setEnergy(entry.energy);
      setWord(entry.word);
    } else {
      setSelectedMood(null);
      setNote('');
      setEnergy(null);
      setWord('');
    }
  }, [selectedDate, mounted, moods]);

  // Derived Stats
  const stats = useMemo(() => {
    const entries = Object.values(moods);
    const total = entries.length;
    const moodCounts = entries.reduce((acc, entry) => {
      acc[entry.mood] = (acc[entry.mood] || 0) + 1;
      return acc;
    }, {} as Record<Mood, number>);

    let mostFrequentMood: Mood | null = null;
    let maxCount = 0;
    (Object.entries(moodCounts) as [Mood, number][]).forEach(([mood, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostFrequentMood = mood;
      }
    });

    return { total, moodCounts, mostFrequentMood: mostFrequentMood as Mood | null };
  }, [moods]);

  if (!mounted) return null;

  const handleLogin = async () => {
    if (!isConfigured || !auth || !provider) {
      setFirebaseError('Firebase no está configurado. Revisa tu archivo .env.example y añade las claves.');
      return;
    }
    try {
      setFirebaseError(null);
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Error logging in:", error);
      setFirebaseError(error.message || "Error al conectar con Google.");
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      setSyncMode('local');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMood) return;

    setIsSaving(true);
    const newEntry: MoodEntry = {
      mood: selectedMood,
      note,
      energy,
      word,
      timestamp: Date.now()
    };

    const newMoods = { ...moods, [selectedDate]: newEntry };
    setMoods(newMoods);
    localStorage.setItem('moodlokura_data', JSON.stringify(newMoods));

    // Save to Cloud if synced
    if (syncMode === 'cloud' && user && db) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'moods', selectedDate), newEntry);
      } catch (error) {
        console.error("Error saving to cloud:", error);
        setFirebaseError("Atención: Los datos se guardaron en local, pero falló la subida a la nube.");
      }
    }

    setTimeout(() => setIsSaving(false), 800);
  };

  const clearData = () => {
    if (confirm('¿Estás seguro de que quieres borrar todos tus datos locales? Si estás en la nube, esto no borrará los datos de Firebase.')) {
      setMoods({});
      localStorage.removeItem('moodlokura_data');
      setSelectedMood(null);
      setNote('');
      setEnergy(null);
      setWord('');
    }
  };

  const prevMonth = () => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1));

  const daysInMonth = getDaysInMonth(currentMonthDate.getFullYear(), currentMonthDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentMonthDate.getFullYear(), currentMonthDate.getMonth());
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const monthName = monthNames[currentMonthDate.getMonth()];
  const year = currentMonthDate.getFullYear();
  const isToday = selectedDate === formatDate(new Date());

  const renderStatusBadge = () => (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider transition-colors
      ${syncMode === 'cloud' 
        ? 'bg-secondary/10 border-secondary/30 text-secondary' 
        : 'bg-surface-variant border-white/10 text-outline'}`}
    >
      {syncMode === 'cloud' ? <Cloud className="w-4 h-4" /> : <MonitorSmartphone className="w-4 h-4" />}
      <span className="hidden sm:inline">{syncMode === 'cloud' ? 'Sincronizado' : 'Modo Local'}</span>
    </div>
  );

  const renderDiario = () => (
    <div className="grid lg:grid-cols-12 gap-10 items-start mt-6">
      <section className="lg:col-span-7 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface capitalize">{monthName} {year}</h1>
            <p className="text-on-surface-variant font-body text-xs uppercase tracking-widest mt-1">Resumen mensual</p>
          </div>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-2 hover:bg-surface-variant rounded-full transition-colors"><ChevronLeft className="w-6 h-6" /></button>
            <button onClick={nextMonth} className="p-2 hover:bg-surface-variant rounded-full transition-colors"><ChevronRight className="w-6 h-6" /></button>
          </div>
        </header>

        <div className="glass-panel p-8 rounded-[2rem] border border-white/5 shadow-inner">
          <div className="grid grid-cols-7 gap-y-6 gap-x-2 text-center">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
              <div key={d} className="text-[10px] font-black text-outline uppercase tracking-tighter">{d}</div>
            ))}
            
            {blanks.map(b => (
              <div key={`blank-${b}`} className="h-12 w-12 mx-auto" />
            ))}
            
            {days.map(d => {
              const dateStr = formatDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), d));
              const entry = moods[dateStr];
              const isSelected = dateStr === selectedDate;
              const isTodayCell = dateStr === formatDate(new Date());

              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`h-12 w-12 mx-auto flex flex-col items-center justify-center rounded-2xl transition-all relative
                    ${entry ? MOODS[entry.mood].bg + ' ' + MOODS[entry.mood].color + ' ' + MOODS[entry.mood].shadow : 'hover:bg-white/5 text-sm font-medium text-outline'}
                    ${isSelected ? 'ring-2 ring-primary ring-offset-4 ring-offset-surface-container' : ''}
                    ${isTodayCell && !isSelected ? 'border border-white/20' : ''}
                  `}
                >
                  {entry ? (
                    <>
                      <span className="text-xs font-bold">{d}</span>
                      <span className="text-[10px]">{MOODS[entry.mood].emoji}</span>
                    </>
                  ) : (
                    <span>{d}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-6 p-6 rounded-2xl bg-surface-container-low border-l-4 border-primary">
          <Lightbulb className="text-primary w-10 h-10 shrink-0" />
          <div>
            <h4 className="font-bold text-on-surface font-headline">Insight del mes</h4>
            <p className="text-sm text-on-surface-variant">
              {Object.keys(moods).length > 0 
                ? "¡Genial! Has estado registrando tus emociones. Sigue explorando tus tendencias."
                : "Comienza a registrar tus estados de ánimo para ver insights personalizados aquí."}
            </p>
          </div>
        </div>
      </section>

      <section className="lg:col-span-5">
        <div className="glass-panel p-8 rounded-[2rem] border border-white/10 shadow-2xl sticky top-28">
          <h2 className="text-2xl font-headline font-bold text-white mb-8">
            {isToday ? 'Registro de hoy' : `Registro del ${formatVisualDate(selectedDate)}`}
          </h2>
          
          {firebaseError && (
            <div className="mb-6 p-4 rounded-xl bg-error-dim/10 border border-error-dim/20 text-error-dim text-sm flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <p>{firebaseError}</p>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-8">
            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-outline">¿Cómo te sientes?</label>
              <div className="flex justify-between items-center gap-2">
                {Object.entries(MOODS).map(([key, mood]) => (
                  <motion.button
                    key={key}
                    type="button"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedMood(key as Mood)}
                    className={`group flex flex-col items-center gap-2 flex-1 transition-all duration-300 rounded-xl p-2
                      ${selectedMood === key ? 'ring-2 ring-primary ring-offset-4 ring-offset-surface-container bg-primary/10' : ''}
                    `}
                  >
                    <span className={`text-3xl transition-all ${selectedMood === key ? '' : 'filter grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100'}`}>
                      {mood.emoji}
                    </span>
                    <span className={`text-[10px] font-bold ${selectedMood === key ? mood.color : 'text-outline group-hover:' + mood.color}`}>
                      {mood.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-outline">¿Qué ha pasado hoy?</label>
              <div className="relative">
                <textarea 
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-white/5 border-none focus:ring-1 focus:ring-primary rounded-2xl p-4 text-on-surface placeholder:text-outline/50 min-h-[120px] resize-none font-body text-sm outline-none transition-all" 
                  maxLength={150} 
                  placeholder="Escribe aquí tus pensamientos..."
                />
                <span className="absolute bottom-3 right-4 text-[10px] text-outline">{note.length} / 150</span>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-outline">Nivel de energía</label>
              <div className="grid grid-cols-3 gap-3">
                {(['baja', 'media', 'alta'] as Energy[]).map((e) => (
                  <button 
                    key={e}
                    type="button" 
                    onClick={() => setEnergy(e)}
                    className={`py-3 px-2 rounded-xl text-xs font-bold transition-all capitalize
                      ${energy === e 
                        ? 'bg-primary text-on-primary-fixed shadow-lg shadow-primary/20' 
                        : 'border border-white/10 hover:bg-white/5 text-on-surface'
                      }
                    `}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-outline">Una palabra para hoy</label>
              <input 
                type="text" 
                value={word}
                onChange={(e) => setWord(e.target.value)}
                className="w-full bg-white/5 border-none focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 font-body text-sm outline-none transition-all" 
                maxLength={30} 
                placeholder="Define tu día en una palabra..." 
              />
            </div>

            <motion.button 
              whileTap={{ scale: selectedMood ? 0.98 : 1 }}
              type="submit" 
              disabled={!selectedMood || isSaving}
              className={`w-full font-headline font-extrabold py-5 rounded-2xl transition-all relative overflow-hidden group flex items-center justify-center gap-2
                ${selectedMood 
                  ? 'bg-gradient-to-r from-primary-dim to-primary text-on-primary-fixed shadow-xl shadow-primary/30 cursor-pointer' 
                  : 'bg-surface-variant text-outline cursor-not-allowed'
                }
              `}
            >
              <AnimatePresence mode="wait">
                {isSaving ? (
                  <motion.span 
                    key="saving"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2"
                  >
                    GUARDADO ✨
                  </motion.span>
                ) : (
                  <motion.span 
                    key="save"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2"
                  >
                    GUARDAR REGISTRO
                    <Send className="w-5 h-5" />
                  </motion.span>
                )}
              </AnimatePresence>
              {selectedMood && (
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              )}
            </motion.button>
          </form>
        </div>
      </section>
    </div>
  );

  const renderEstadisticas = () => {
    const keys = Object.keys(MOODS) as Mood[];
    return (
      <div className="mt-8 space-y-10">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">Tus Estadísticas</h1>
          <p className="text-on-surface-variant font-body text-xs uppercase tracking-widest mt-1">Visión general de tus emociones</p>
        </div>

        {stats.total === 0 ? (
          <div className="glass-panel p-12 rounded-[2rem] text-center border border-white/5">
            <BarChart className="w-16 h-16 text-outline mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-headline font-bold text-on-surface mb-2">Aún no hay datos</h3>
            <p className="text-on-surface-variant text-sm">Registra tu primer estado de ánimo para comenzar a ver tus estadísticas.</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Global Stats */}
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-panel p-6 rounded-[2rem] border border-white/5">
                  <span className="text-outline text-xs font-bold uppercase tracking-widest">Entradas Totales</span>
                  <p className="text-5xl font-headline font-black text-on-surface mt-2">{stats.total}</p>
                </div>
                <div className="glass-panel p-6 rounded-[2rem] border border-white/5">
                  <span className="text-outline text-xs font-bold uppercase tracking-widest">Mood Frecuente</span>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-4xl">{stats.mostFrequentMood ? MOODS[stats.mostFrequentMood].emoji : '—'}</span>
                    <span className={`text-xl font-bold ${stats.mostFrequentMood ? MOODS[stats.mostFrequentMood].color : 'text-outline'}`}>
                      {stats.mostFrequentMood ? MOODS[stats.mostFrequentMood].label : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-8 rounded-[2rem] border border-white/5">
                <h3 className="text-sm font-bold uppercase tracking-widest text-outline mb-6">Distribución Emocional</h3>
                <div className="space-y-6">
                  {keys.map((mood) => {
                    const count = stats.moodCounts[mood] || 0;
                    const percentage = Math.round((count / stats.total) * 100) || 0;
                    return (
                      <div key={mood} className="space-y-2">
                        <div className="flex justify-between text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <span>{MOODS[mood].emoji}</span>
                            <span className={MOODS[mood].color}>{MOODS[mood].label}</span>
                          </div>
                          <span className="text-on-surface-variant font-bold">{percentage}%</span>
                        </div>
                        <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className={`h-full rounded-full ${MOODS[mood].bg.replace('/20', '')}`}
                            style={{ backgroundColor: MOODS[mood].color.includes('tertiary') ? '#fbbf24' : MOODS[mood].color.includes('secondary') ? '#0ea5e9' : MOODS[mood].color.includes('primary') ? '#7c3aed' : MOODS[mood].color.includes('error-dim') ? '#d73357' : '#ff6e84' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Reflection Insights */}
            <div className="glass-panel p-8 rounded-[2rem] border border-white/5 bg-gradient-to-b from-surface-variant/20 to-transparent">
              <h3 className="text-sm font-bold uppercase tracking-widest text-outline mb-6">Palabras Recurrentes</h3>
              <div className="flex flex-wrap gap-3">
                {Object.values(moods)
                  .filter(m => m.word)
                  .map((m, i) => (
                    <span key={i} className="px-4 py-2 bg-surface-container-low rounded-xl text-sm text-primary font-medium border border-primary/10">
                      {m.word}
                    </span>
                  ))}
                {Object.values(moods).filter(m => m.word).length === 0 && (
                  <p className="text-on-surface-variant text-sm">Aún no has usado palabras para definir tus días.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCalendario = () => {
    // We'll show a timeline/history of entries
    const sortedDates = Object.keys(moods).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return (
      <div className="mt-8 space-y-10 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">Historial</h1>
          <p className="text-on-surface-variant font-body text-xs uppercase tracking-widest mt-1">Tu línea de tiempo emocional</p>
        </div>

        {sortedDates.length === 0 ? (
          <div className="glass-panel p-12 rounded-[2rem] text-center border border-white/5">
            <Clock className="w-16 h-16 text-outline mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-headline font-bold text-on-surface mb-2">No hay registros</h3>
            <p className="text-on-surface-variant text-sm">Tus entradas diarias aparecerán aquí formando tu historia.</p>
          </div>
        ) : (
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-surface-variant before:to-transparent">
            {sortedDates.map((dateStr, index) => {
              const entry = moods[dateStr];
              const moodData = MOODS[entry.mood];
              const d = parseDateString(dateStr);
              
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  key={dateStr} 
                  className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-full border-4 border-background bg-surface-container shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 overflow-hidden shadow-xl">
                    <span className="text-xl">{moodData.emoji}</span>
                  </div>
                  
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] glass-panel p-6 rounded-[2rem] border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs font-bold uppercase tracking-widest ${moodData.color}`}>{formatVisualDate(dateStr)}</span>
                      {entry.energy && (
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-white/5 ${ENERGY_COLORS[entry.energy]}`}>
                          Energía {entry.energy}
                        </span>
                      )}
                    </div>
                    {entry.note ? (
                      <p className="text-on-surface text-sm leading-relaxed">{entry.note}</p>
                    ) : (
                      <p className="text-on-surface-variant text-sm italic">Sin notas detalladas.</p>
                    )}
                    {entry.word && (
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <span className="text-xs text-outline uppercase tracking-widest mr-2">Palabra:</span>
                        <span className="text-sm font-bold text-on-surface bg-surface-variant/50 px-2 py-1 rounded inline-block">{entry.word}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderAjustes = () => (
    <div className="mt-8 space-y-10 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">Ajustes</h1>
        <p className="text-on-surface-variant font-body text-xs uppercase tracking-widest mt-1">Preferencias y datos</p>
      </div>

      <div className="glass-panel p-8 rounded-[2rem] border border-white/5 space-y-8">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-outline mb-4">Cuenta</h3>
          <div className="bg-surface-container-low p-6 rounded-2xl border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-12 h-12 rounded-full border-2 border-primary/20" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-surface-variant flex items-center justify-center border border-white/10 text-xl">👤</div>
              )}
              
              <div>
                <p className="text-on-surface font-bold flex items-center gap-2">
                  {user ? user.displayName || 'Usuario con Estado de Ánimo' : 'Modo Local'}
                </p>
                <p className="text-on-surface-variant text-sm">
                  {user ? user.email : 'Tus datos se guardan solo en este dispositivo.'}
                </p>
              </div>
            </div>
            
            {user ? (
               <button onClick={handleLogout} className="flex items-center gap-2 bg-surface-variant hover:bg-white/10 text-on-surface font-medium py-2 px-4 rounded-xl transition-all border border-white/10 whitespace-nowrap text-sm">
                 <LogOut className="w-4 h-4" />
                 Cerrar Sesión
               </button>
            ) : (
               <button onClick={handleLogin} disabled={isLoadingAuth} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-on-surface font-medium py-2 px-4 rounded-xl transition-all border border-white/10 whitespace-nowrap text-sm disabled:opacity-50">
                 {isLoadingAuth ? <Loader2 className="w-4 h-4 animate-spin" /> : <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDwCHa44betZ_cEar5e9ze8TtcFVCdVRKwS8BPaBpKHMh8m64xFQNUBpV6JVfDPA4L2h7vMKNu1NXuvb9h900s6r5tNhw8Wx785tpeKIXr_L7gubyVkW-clR5gcwObJ6QsPUsxCGWEgF3yRvZOfe-f62Bj_3DPA7tOSelb4IHljzizWwiHAmtsW-_iDI7Z6SR2xKHbhtzbw6xYP5_ITmGl4k2roVYmQpc7gn-6X1Pryygk2SLlEaR4vpuoFNM7rHaClF49-UJyevs77" alt="Google" className="w-4 h-4" />}
                 Conectar Cuenta
               </button>
            )}
          </div>
        </div>

        <div className="h-px w-full bg-white/5" />

        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-outline mb-4 gap-2 flex items-center text-error-dim">
            <ShieldAlert className="w-4 h-4" /> Zona de Peligro
          </h3>
          <div className="bg-error-dim/10 p-6 rounded-2xl border border-error-dim/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-error-dim font-bold">Borrar todos los datos locales</p>
              <p className="text-error-dim/70 text-sm">Esta acción eliminará el historial guardado en este navegador.</p>
            </div>
            <button 
              onClick={clearData}
              className="flex items-center gap-2 bg-error-dim hover:bg-error text-white font-bold py-2 px-6 rounded-xl transition-all shadow-lg shadow-error-dim/20 whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              Borrar Datos
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <header className="fixed top-0 w-full z-50 bg-background/60 backdrop-blur-xl border-b border-white/5 flex justify-between items-center px-4 sm:px-6 h-20">
        <div className="flex items-center gap-2">
          <span className="text-xl sm:text-2xl font-headline font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-dim">
            MoodLOKURA
          </span>
          <div className="md:hidden ml-2">{renderStatusBadge()}</div>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          {(['diario', 'estadisticas', 'calendario', 'ajustes'] as View[]).map((view) => (
            <button 
              key={view} 
              onClick={() => setCurrentView(view)}
              className={`font-headline tracking-tight capitalize transition-colors ${currentView === view ? 'text-primary font-bold' : 'text-outline hover:text-primary-dim'}`}
            >
              {view}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <div className="hidden md:block">
            {renderStatusBadge()}
          </div>
          <button onClick={() => setCurrentView('ajustes')} className="scale-95 hover:scale-100 active:scale-90 transition-transform">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-primary/20 shadow-lg" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center border border-white/10">
                <span className="text-sm">👤</span>
              </div>
            )}
          </button>
        </div>
      </header>

      <aside className="hidden lg:flex h-screen w-72 fixed left-0 top-0 z-40 flex-col p-6 bg-surface-container-low/80 backdrop-blur-2xl border-r border-white/5 pt-28">
        <div className="space-y-1 mb-8">
          <h2 className="text-on-surface text-xl font-black font-body">
            {user ? `¡Hola, ${user.displayName?.split(' ')[0]}!` : 'Bienvenido'}
          </h2>
          <p className="text-on-surface-variant text-sm">¿Cómo te sientes hoy?</p>
        </div>
        <nav className="flex flex-col gap-2">
          <button 
            onClick={() => setCurrentView('diario')}
            className={`w-full flex items-center gap-4 rounded-xl px-4 py-3 transition-all ${currentView === 'diario' ? 'bg-primary/10 text-primary border-l-4 border-primary' : 'text-outline hover:text-on-surface hover:bg-white/5 border-l-4 border-transparent'}`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="font-medium text-sm">Diario</span>
          </button>
          <button 
            onClick={() => setCurrentView('estadisticas')}
            className={`w-full flex items-center gap-4 rounded-xl px-4 py-3 transition-all ${currentView === 'estadisticas' ? 'bg-primary/10 text-primary border-l-4 border-primary' : 'text-outline hover:text-on-surface hover:bg-white/5 border-l-4 border-transparent'}`}
          >
            <BarChart className="w-5 h-5" />
            <span className="font-medium text-sm">Estadísticas</span>
          </button>
          <button 
            onClick={() => setCurrentView('calendario')}
            className={`w-full flex items-center gap-4 rounded-xl px-4 py-3 transition-all ${currentView === 'calendario' ? 'bg-primary/10 text-primary border-l-4 border-primary' : 'text-outline hover:text-on-surface hover:bg-white/5 border-l-4 border-transparent'}`}
          >
            <CalendarIcon className="w-5 h-5" />
            <span className="font-medium text-sm">Calendario</span>
          </button>
          <button 
            onClick={() => setCurrentView('ajustes')}
            className={`w-full flex items-center gap-4 rounded-xl px-4 py-3 transition-all ${currentView === 'ajustes' ? 'bg-primary/10 text-primary border-l-4 border-primary' : 'text-outline hover:text-on-surface hover:bg-white/5 border-l-4 border-transparent'}`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium text-sm">Ajustes</span>
          </button>
        </nav>
        <div className="mt-auto">
          {user ? (
            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-3 bg-surface-variant hover:bg-white/10 text-on-surface font-medium py-3 px-4 rounded-xl transition-all border border-white/10 group">
               <LogOut className="w-4 h-4 text-outline" />
               <span className="text-xs">Cerrar Sesión</span>
            </button>
          ) : (
            <button onClick={handleLogin} disabled={isLoadingAuth} className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-on-surface font-medium py-3 px-4 rounded-xl transition-all border border-white/10 group disabled:opacity-50">
              {isLoadingAuth ? <Loader2 className="w-4 h-4 animate-spin" /> : <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDwCHa44betZ_cEar5e9ze8TtcFVCdVRKwS8BPaBpKHMh8m64xFQNUBpV6JVfDPA4L2h7vMKNu1NXuvb9h900s6r5tNhw8Wx785tpeKIXr_L7gubyVkW-clR5gcwObJ6QsPUsxCGWEgF3yRvZOfe-f62Bj_3DPA7tOSelb4IHljzizWwiHAmtsW-_iDI7Z6SR2xKHbhtzbw6xYP5_ITmGl4k2roVYmQpc7gn-6X1Pryygk2SLlEaR4vpuoFNM7rHaClF49-UJyevs77" alt="Google" className="w-5 h-5" />}
              <span className="text-xs">Iniciar sesión con Google</span>
            </button>
          )}
        </div>
      </aside>

      <main className="lg:ml-72 pt-28 pb-12 px-6 lg:px-12 max-w-7xl mx-auto min-h-screen">
        {/* Banner with Google Sign In suggestion */}
        {currentView === 'diario' && !user && !isLoadingAuth && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-10 p-4 rounded-2xl glass-panel border border-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Info className="text-primary w-6 h-6 shrink-0" />
              <p className="text-sm text-on-surface-variant">Inicia sesión con Google para guardar tu historial y sincronizar tus estados de ánimo.</p>
            </div>
            <button onClick={handleLogin} className="text-xs font-bold text-primary hover:text-primary-dim transition-colors px-4 py-2 border border-primary/20 rounded-lg whitespace-nowrap">
              CONECTAR
            </button>
          </motion.div>
        )}

        {firebaseError && (
          <div className="mb-6 p-4 rounded-xl bg-error-dim/10 border border-error-dim/20 text-error-dim text-sm flex items-center gap-3 max-w-4xl mx-auto">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <p>{firebaseError}</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {currentView === 'diario' && renderDiario()}
            {currentView === 'estadisticas' && renderEstadisticas()}
            {currentView === 'calendario' && renderCalendario()}
            {currentView === 'ajustes' && renderAjustes()}
          </motion.div>
        </AnimatePresence>
      </main>

      <div className="fixed top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="fixed bottom-[-5%] left-[-5%] w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
    </>
  );
}
