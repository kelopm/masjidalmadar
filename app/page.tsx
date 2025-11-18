'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Worker = {
  id: string;
  display_name: string;
  created_at: string;
};

type OnShift = {
  id: string;
  name: string;
};

type BreakEntry = {
  id: string;
  worker_id: string;
  break_date: string;
  start_time: string; // "HH:MM:SS" or "HH:MM"
  end_time: string;
};

type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

type PrayerTimesToday = {
  fajr: string;
  dhuhr: string;
  asr: string;
  asr2: string | null;
  maghrib: string;
  isha: string;
  sunrise: string;
};

type CurrentPrayerInfo = {
  key: PrayerKey;
  label: string;
  time: string;
  windowStart: string;
  windowEnd: string;
};

type PrayerWorker = {
  id: string;
  name: string;
  hasPrayed: boolean;
};

export default function HomePage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const onShiftRef = useRef<HTMLDivElement | null>(null);
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false);
  const workerSelectRef = useRef<HTMLDivElement | null>(null);

  const [name, setName] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [onShift, setOnShift] = useState<OnShift[]>([]);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [testTimeLocal, setTestTimeLocal] = useState('');

  const [myWorkerId, setMyWorkerId] = useState<string | null>(null);
  const [myWorkerInput, setMyWorkerInput] = useState('');

  const [selectedBreakDate, setSelectedBreakDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');
  const [savingBreak, setSavingBreak] = useState(false);

  const [breaks, setBreaks] = useState<BreakEntry[]>([]);
  const [loadingBreaks, setLoadingBreaks] = useState(false);

  const [prayerLoading, setPrayerLoading] = useState(false);
  const [currentPrayer, setCurrentPrayer] = useState<CurrentPrayerInfo | null>(null);
  const [prayerWorkers, setPrayerWorkers] = useState<PrayerWorker[]>([]);
  const [prayerTimesToday, setPrayerTimesToday] = useState<PrayerTimesToday | null>(null);

  const [helpOpen, setHelpOpen] = useState(false);

  // Load workers on mount
  useEffect(() => {
    const loadWorkers = async () => {
      try {
        const res = await fetch('/api/workers');
        const json = await res.json();
        if (res.ok) {
          setWorkers(json.workers ?? []);
        } else {
          setError(json.error ?? 'Failed to load workers');
        }
      } catch (err) {
        setError('Network error loading workers');
      } finally {
        setLoadingWorkers(false);
      }
    };

    loadWorkers();
  }, []);

  // Load "my" worker id from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('myWorkerId');
    if (stored) {
      setMyWorkerId(stored);
    }
  }, []);

  // Whenever we know myWorkerId + workers, keep the input showing that name
  useEffect(() => {
    if (!myWorkerId) return;
    const worker = workers.find((w) => w.id === myWorkerId);
    if (worker) {
      setMyWorkerInput(worker.display_name);
    }
  }, [myWorkerId, workers]);

  // Load breaks for the selected date
  useEffect(() => {
    const loadBreaks = async () => {
      setLoadingBreaks(true);
      try {
        const res = await fetch(`/api/breaks?date=${selectedBreakDate}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? 'Failed to load breaks');
        } else {
          setBreaks(json.breaks ?? []);
        }
      } catch (err) {
        setError('Network error loading breaks');
      } finally {
        setLoadingBreaks(false);
      }
    };

    loadBreaks();
  }, [selectedBreakDate]);

  // Load current prayer info and who is on shift for it
  useEffect(() => {
    const loadPrayerInfo = async () => {
      setPrayerLoading(true);
      try {
        const res = await fetch('/api/prayer');
        const json = await res.json();

        if (!res.ok) {
          setError(json.error ?? 'Failed to load prayer info');
        } else {
          setCurrentPrayer(json.currentPrayer ?? null);
          setPrayerWorkers(json.onShift ?? []);
          setPrayerTimesToday(json.times ?? null);
        }
      } catch (err) {
        setError('Network error loading prayer info');
      } finally {
        setPrayerLoading(false);
      }
    };

    loadPrayerInfo();
    const id = setInterval(loadPrayerInfo, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!workerSelectRef.current) return;

      const target = event.target as Node | null;
      if (target && !workerSelectRef.current.contains(target)) {
        setWorkerDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleTogglePrayerStatus = async (workerId: string, current: boolean) => {
    if (!currentPrayer) return;

    try {
      const res = await fetch('/api/prayer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId,
          prayerKey: currentPrayer.key,
          hasPrayed: !current,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to update prayer status');
        return;
      }

      setPrayerWorkers((prev) =>
        prev.map((w) =>
          w.id === workerId ? { ...w, hasPrayed: !current } : w
        )
      );
    } catch (err) {
      setError('Network error updating prayer status');
    }
  };

  const handleAddWorker = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !icalUrl) {
      setError('Please provide a name and iCal URL.');
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icalUrl }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to add worker');
      } else {
        setWorkers((prev) => [...prev, json.worker]);
        setName('');
        setIcalUrl('');

        // mark this worker as "me"
        setMyWorkerId(json.worker.id);
        setMyWorkerInput(json.worker.display_name);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('myWorkerId', json.worker.id);
        }
      }
    } catch (err) {
      setError('Network error adding worker');
    } finally {
      setAdding(false);
    }
  };

  const handleCheckWhosOn = async () => {
    setChecking(true);
    setError(null);
    try {
      let url = '/api/whos-on';

      if (testTimeLocal) {
        const localDate = new Date(testTimeLocal);
        if (!isNaN(localDate.getTime())) {
          const iso = localDate.toISOString();
          url += `?at=${encodeURIComponent(iso)}`;
        }
      }

      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to check shifts');
      } else {
        setOnShift(json.onShift ?? []);
        setLastChecked(json.at ?? null);

        // scroll to the "On shift right now" section
        if (onShiftRef.current) {
          onShiftRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      }
    } catch (err) {
      setError('Network error checking who is on shift');
    } finally {
      setChecking(false);
    }
  };

  const handleSaveBreak = async () => {
    if (!myWorkerId) {
      setError('Select your name in the box at the top before saving a break.');
      return;
    }
    if (!breakStart || !breakEnd) {
      setError('Please enter both break start and end times.');
      return;
    }

    setSavingBreak(true);
    setError(null);

    try {
      const res = await fetch('/api/breaks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: myWorkerId,
          breakDate: selectedBreakDate,
          startTime: breakStart,
          endTime: breakEnd,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to save break');
      } else {
        setBreakStart('');
        setBreakEnd('');

        try {
          const res2 = await fetch(`/api/breaks?date=${selectedBreakDate}`);
          const json2 = await res2.json();
          if (res2.ok) {
            setBreaks(json2.breaks ?? []);
          }
        } catch {
          // ignore reload errors here
        }
      }
    } catch (err) {
      setError('Network error saving break');
    } finally {
      setSavingBreak(false);
    }
  };

  const handleDeleteBreak = async (breakId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/breaks?id=${breakId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to delete break');
        return;
      }
      setBreaks((prev) => prev.filter((b) => b.id !== breakId));
    } catch (err) {
      setError('Network error deleting break');
    }
  };

  // -------- Helpers --------
  const formatTime = (t: string) => t.slice(0, 5); // "HH:MM:SS" -> "HH:MM"

  const sortedWorkers = [...workers].sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  );
  const filteredWorkers = sortedWorkers.filter((w) =>
    w.display_name.toLowerCase().includes(myWorkerInput.trim().toLowerCase())
  );

  const selectWorker = (worker: Worker) => {
    setMyWorkerInput(worker.display_name);
    setMyWorkerId(worker.id);
    setWorkerDropdownOpen(false);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('myWorkerId', worker.id);
    }
  };

  const handleWorkerInputChange = (value: string) => {
    setMyWorkerInput(value);
    setWorkerDropdownOpen(true);

    // If completely cleared, also clear selected worker
    if (value.trim() === '') {
      setMyWorkerId(null);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('myWorkerId');
      }
    }
  };

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const breaksWithNames = breaks.map((b) => {
    const worker = workers.find((w) => w.id === b.worker_id);
    return {
      ...b,
      workerName: worker?.display_name ?? 'Unknown',
    };
  });

  const breaksWithOverlaps = [...breaksWithNames]
    .sort((a, b) => a.workerName.localeCompare(b.workerName))
    .map((b, i, arr) => {
      const s1 = toMinutes(b.start_time);
      const e1 = toMinutes(b.end_time);

      const overlapsWith = arr
        .filter((other, j) => j !== i)
        .filter((other) => {
          const s2 = toMinutes(other.start_time);
          const e2 = toMinutes(other.end_time);
          return s1 < e2 && e1 > s2;
        })
        .map((other) => other.workerName);

      return { ...b, overlapsWith };
    });

  return (
    <main className="min-h-screen flex flex-col items-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-3xl space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            Masjid Al Madar مدار
          </h1>
          <p className="text-slate-700">
            وَمَا خَلَقْتُ ٱلْجِنَّ وَٱلْإِنسَ إِلَّا لِيَعْبُدُونِ

          </p>
          <p className="text-slate-700">
            I did not create jinn and humans except to worship Me. (51:56)
          </p>

          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              How to use this page
            </button>
          </div>


          {workers.length > 0 && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3 sm:justify-center">
                <div ref={workerSelectRef} className="relative w-64">
                  <input
                    type="text"
                    placeholder="Start typing your name..."
                    value={myWorkerInput}
                    onChange={(e) => handleWorkerInputChange(e.target.value)}
                    onFocus={() => setWorkerDropdownOpen(true)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />


                  {/* Dropdown arrow */}
                  <button
                    type="button"
                    className="pointer-events-auto absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500"
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep focus on input
                      setWorkerDropdownOpen((open) => !open);
                    }}
                  >
                    ▾
                  </button>

                  {/* Dropdown list */}
                  {workerDropdownOpen && filteredWorkers.length > 0 && (
                    <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white text-left shadow-lg">
                      {filteredWorkers.map((w) => (
                        <li
                          key={w.id}
                          className="cursor-pointer px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100"
                          onMouseDown={(e) => {
                            e.preventDefault(); // select before blur
                            selectWorker(w);
                          }}
                        >
                          {w.display_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-600">
                This is a searchable dropdown - type a few letters or click the arrow to see the list.
              </p>
            </div>
          )}

        </header>

        {error && (
          <div className="rounded-md bg-red-100 text-red-800 px-4 py-2 text-sm">
            {error}
          </div>
        )}

        {/* 1. Prayer during this shift */}
        <section className="bg-white rounded-xl shadow-sm p-4 md:p-6 space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">
            Prayer during this shift
          </h2>

          {prayerTimesToday && (
            <p className="text-xs text-slate-700">
              Today - Fajr {prayerTimesToday.fajr}, Dhuhr {prayerTimesToday.dhuhr}, Asr {prayerTimesToday.asr}
              {prayerTimesToday.asr2 ? ` (mithl 2: ${prayerTimesToday.asr2})` : ''}
              , Maghrib {prayerTimesToday.maghrib}, Isha {prayerTimesToday.isha}
            </p>
          )}

          {prayerLoading ? (
            <p className="text-sm text-slate-700">Loading prayer info…</p>
          ) : !currentPrayer ? (
            <p className="text-sm text-slate-700">
              No prayer time in effect right now.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-800">
                Current prayer:{' '}
                <span className="font-semibold">{currentPrayer.label}</span>{' '}
                <span className="text-slate-700">
                  at {currentPrayer.time} ({currentPrayer.windowStart}–{currentPrayer.windowEnd})
                </span>
              </p>

              {prayerWorkers.length === 0 ? (
                <p className="text-sm text-slate-700">
                  No brothers on shift during this prayer.
                </p>
              ) : (
                <ul className="space-y-1">
                  {prayerWorkers.map((w) => (
                    <li
                      key={w.id}
                      className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={w.hasPrayed}
                          onChange={() => handleTogglePrayerStatus(w.id, w.hasPrayed)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-900">{w.name}</span>
                      </div>
                      <span className="text-xs text-slate-700">
                        {w.hasPrayed ? 'Prayed' : 'Not yet'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* 2. Brothers in the system */}
        <section className="bg-white rounded-xl shadow-sm p-4 md:p-6 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">
              Brothers in the system
            </h2>

            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
              <div className="flex flex-col">
                <label className="text-xs font-medium text-slate-700">
                  Check at time (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={testTimeLocal}
                    onChange={(e) => setTestTimeLocal(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setTestTimeLocal('')}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <button
                onClick={handleCheckWhosOn}
                disabled={checking}
                className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {checking ? 'Checking…' : "Who's on now?"}
              </button>
            </div>
          </div>

          {loadingWorkers ? (
            <p className="text-sm text-slate-700">Loading brothers…</p>
          ) : workers.length === 0 ? (
            <p className="text-sm text-slate-700">
              No brothers added yet. Add your rota below.
            </p>
          ) : (
            <ul className="space-y-1">
              {sortedWorkers.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="text-slate-900">{w.display_name}</span>
                  <span className="text-xs text-slate-700">
                    joined {new Date(w.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* On shift now */}
        <section
          ref={onShiftRef}
          className="bg-white rounded-xl shadow-sm p-4 md:p-6 space-y-3"
        >
          <h2 className="text-xl font-semibold text-slate-900">
            On shift right now
          </h2>
          {lastChecked && (
            <p className="text-xs text-slate-700">
              Last checked at {new Date(lastChecked).toLocaleString()}
            </p>
          )}

          {onShift.length === 0 ? (
            <p className="text-sm text-slate-700">
              {lastChecked
                ? 'Nobody on shift at that time (or calendars failed to load).'
                : 'Click "Who\'s on now?" above to check.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {onShift.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                >
                  {p.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3. Breaks section */}
        <section className="bg-white rounded-xl shadow-sm p-4 md:p-6 space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Breaks for the day
          </h2>

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col">
                <label className="text-xs font-medium text-slate-700">
                  Date
                </label>
                <input
                  type="date"
                  value={selectedBreakDate}
                  onChange={(e) => setSelectedBreakDate(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-medium text-slate-700">
                  My break start
                </label>
                <input
                  type="time"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-medium text-slate-700">
                  My break end
                </label>
                <input
                  type="time"
                  value={breakEnd}
                  onChange={(e) => setBreakEnd(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={!myWorkerId || !breakStart || !breakEnd || savingBreak}
              onClick={handleSaveBreak}
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {savingBreak ? 'Saving…' : 'Save my break'}
            </button>
          </div>

          <p className="text-xs text-slate-700">
            Select your name at the top, then add your break for this day. Everyone can see who&apos;s on
            break together.
          </p>

          <div className="space-y-2">
            {loadingBreaks ? (
              <p className="text-sm text-slate-700">Loading breaks…</p>
            ) : breaksWithOverlaps.length === 0 ? (
              <p className="text-sm text-slate-700">
                No breaks saved for this date yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {breaksWithOverlaps.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-col rounded-md border border-slate-200 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <span>
                      <span className="font-medium text-slate-900">{b.workerName}</span>{' '}
                      <span className="text-slate-800">
                        {formatTime(b.start_time)} - {formatTime(b.end_time)}
                      </span>
                    </span>

                    <div className="mt-1 flex items-center justify-between text-xs text-slate-700 md:mt-0 md:ml-4">
                      <span>
                        {b.overlapsWith.length > 0
                          ? `Overlaps with: ${b.overlapsWith.join(', ')}`
                          : 'No overlaps'}
                      </span>

                      {b.worker_id === myWorkerId && (
                        <div className="ml-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBreakDate(b.break_date);
                              const start = b.start_time.slice(0, 5);
                              const end = b.end_time.slice(0, 5);
                              setBreakStart(start);
                              setBreakEnd(end);
                            }}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBreak(b.id)}
                            className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 4. Add worker form (rota) */}
        <section className="bg-white rounded-xl shadow-sm p-4 md:p-6 space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Add your rota (iCal link)
          </h2>
          <form onSubmit={handleAddWorker} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-800">
                Name
              </label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="e.g. Ahmed"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-800">
                iCal URL
              </label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Paste your work schedule iCal link"
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
              />
              <p className="text-xs text-slate-700">
                This link is kept on the server and not shown publicly.
              </p>
            </div>

            <button
              type="submit"
              disabled={adding}
              className="inline-flex items-center rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {adding ? 'Saving…' : 'Save rota'}
            </button>
          </form>
        </section>
      </div>

      {/* Help modal */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <h2
                id="help-title"
                className="text-lg font-semibold text-slate-900"
              >
                How to use this page
              </h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close help"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                This page helps brothers on shift look out for each other and
                organise their prayers.
              </p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  <span className="font-semibold">Add your rota once:</span>{' '}
                  Scroll to &quot;Add your rota&quot; and paste your work iCal
                  link. This is stored securely on the server and not shown
                  publicly.
                </li>
                <li>
                  <span className="font-semibold">Select your name:</span>{' '}
                  Use the searchable box at the top to choose yourself. The site
                  will remember you on this device.
                </li>
                <li>
                  <span className="font-semibold">
                    See who&apos;s on shift:
                  </span>{' '}
                  In &quot;Brothers in the system&quot; click&nbsp;&quot;Who&apos;s on now?&quot; to see who is working at
                  this moment. The page will scroll down to the results.
                </li>
                <li>
                  <span className="font-semibold">Track prayer together:</span>{' '}
                  In &quot;Prayer during this shift&quot; you&apos;ll see the
                  current prayer and which brothers are on shift. Tick the box
                  when you&apos;ve prayed. These ticks reset automatically every
                  night.
                </li>
                <li>
                  <span className="font-semibold">Add your break:</span>{' '}
                  In &quot;Breaks for the day&quot; choose the date, set your
                  break start and end, then click &quot;Save my break&quot;.
                  You&apos;ll see who&apos;s on break at the same time and can
                  edit or delete your own entry.
                </li>
              </ol>
              <p className="text-xs text-slate-500">
                Please share any feedback or feature requests to the GC. May Allah bless you all!
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
