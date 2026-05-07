(() => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const root = document.documentElement;
  const strings = Array.from(document.querySelectorAll("[data-guitar] .string"));
  const guitar = document.querySelector("[data-guitar]");
  const soundToggle = document.querySelector("[data-sound-toggle]");
  const chordTabs = Array.from(document.querySelectorAll("[data-chord]"));
  const chordLabel = document.querySelector("[data-chord-label]");
  const disciplineCard = document.querySelector("[data-discipline-card]");
  const cardToggles = Array.from(document.querySelectorAll("[data-card-toggle]"));
  const timerRoot = document.querySelector("[data-round-timer]");
  const timerPhase = document.querySelector("[data-timer-phase]");
  const timerTime = document.querySelector("[data-timer-time]");
  const timerRound = document.querySelector("[data-timer-round]");
  const timerProgress = document.querySelector("[data-timer-progress]");
  const timerSummary = document.querySelector("[data-timer-summary]");
  const timerCue = document.querySelector("[data-timer-cue]");
  const timerStart = document.querySelector("[data-timer-start]");
  const timerReset = document.querySelector("[data-timer-reset]");
  const timerPresetButtons = Array.from(document.querySelectorAll("[data-timer-preset]"));
  const roundReflection = document.querySelector("[data-round-reflection]");
  const roundForm = document.querySelector("[data-round-form]");
  const roundInput = document.querySelector("[data-round-input]");
  const roundLog = document.querySelector("[data-round-log]");
  const roundLogList = document.querySelector("[data-round-log-list]");

  const CHORDS = {
    am: {
      label: "Am",
      accent: "#c84232",
      soft: "rgba(200, 66, 50, .13)",
      grid: "rgba(200, 66, 50, .16)",
      notes: [82.41, 110.00, 164.81, 220.00, 261.63, 329.63],
      labels: ["E2", "A2", "E3", "A3", "C4", "E4"],
    },
    fsharp: {
      label: "F#m7",
      accent: "#305f72",
      soft: "rgba(48, 95, 114, .15)",
      grid: "rgba(48, 95, 114, .18)",
      notes: [92.50, 138.59, 164.81, 220.00, 277.18, 369.99],
      labels: ["F#2", "C#3", "E3", "A3", "C#4", "F#4"],
    },
    cmaj: {
      label: "Cmaj7",
      accent: "#667d45",
      soft: "rgba(102, 125, 69, .16)",
      grid: "rgba(102, 125, 69, .18)",
      notes: [82.41, 130.81, 164.81, 196.00, 246.94, 329.63],
      labels: ["E2", "C3", "E3", "G3", "B3", "E4"],
    },
  };

  let audioContext = null;
  let soundEnabled = true;
  let isDragging = false;
  let lastPlayed = null;
  let activeChordKey = "am";
  let currentGridColor = CHORDS.am.grid;

  const setToggleState = () => {
    if (!soundToggle) return;
    soundToggle.textContent = soundEnabled ? "Sound on" : "Muted";
    soundToggle.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
  };

  const ensureAudio = () => {
    if (!soundEnabled) return null;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!audioContext) audioContext = new AudioCtor();
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  };

  const animateString = (button, delayMs = 0) => {
    if (!button || prefersReducedMotion) return;
    window.setTimeout(() => {
      button.classList.remove("is-playing");
      void button.offsetWidth;
      button.classList.add("is-playing");
      window.setTimeout(() => button.classList.remove("is-playing"), 430);
    }, delayMs);
  };

  const playFrequency = (frequency, delaySeconds = 0, peakGain = 0.22) => {
    const ctx = ensureAudio();
    if (!ctx) return;

    const start = ctx.currentTime + delaySeconds;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.996, start + 0.28);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, start);
    filter.frequency.exponentialRampToValueAtTime(520, start + 0.34);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.78);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.82);
  };

  const playNote = (button) => {
    if (!button) return;
    const note = Number(button.dataset.note);
    if (!Number.isFinite(note)) return;
    animateString(button);
    playFrequency(note);
  };

  const playStrum = (direction = "down") => {
    const orderedStrings = direction === "up" ? [...strings].reverse() : strings;
    orderedStrings.forEach((button, index) => {
      const note = Number(button.dataset.note);
      const delayMs = index * 38;
      if (Number.isFinite(note)) playFrequency(note, delayMs / 1000, 0.15);
      animateString(button, delayMs);
    });
  };

  const applyChord = (key, options = { play: false }) => {
    const chord = CHORDS[key] || CHORDS.am;
    activeChordKey = key;
    root.style.setProperty("--accent", chord.accent);
    root.style.setProperty("--accent-soft", chord.soft);
    root.style.setProperty("--accent-grid", chord.grid);
    currentGridColor = chord.grid;

    strings.forEach((button, index) => {
      button.dataset.note = String(chord.notes[index]);
      button.dataset.label = chord.labels[index];
      button.setAttribute("aria-label", `Play ${chord.labels[index]} string`);
    });

    chordTabs.forEach((tab) => {
      const isActive = tab.dataset.chord === key;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    if (chordLabel) {
      chordLabel.textContent = `${chord.label} selected.`;
    }

    if (options.play) {
      playStrum("down");
    }
  };

  strings.forEach((button) => {
    button.addEventListener("pointerdown", () => {
      isDragging = true;
      lastPlayed = button;
      playNote(button);
    });

    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      playNote(button);
    });
  });

  document.addEventListener("pointerup", () => {
    isDragging = false;
    lastPlayed = null;
  });

  document.addEventListener("pointermove", (event) => {
    if (!isDragging || !guitar) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const stringButton = element?.closest?.(".string");
    if (!stringButton || stringButton === lastPlayed) return;
    lastPlayed = stringButton;
    playNote(stringButton);
  });

  chordTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      applyChord(tab.dataset.chord || activeChordKey, { play: true });
    });
  });

  if (soundToggle) {
    soundToggle.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      setToggleState();
      if (!soundEnabled && audioContext?.state === "running") {
        audioContext.suspend();
      }
    });
    setToggleState();
  }

  applyChord(activeChordKey, { play: false });

  const setCardFlipped = (isFlipped) => {
    if (!disciplineCard) return;
    disciplineCard.classList.toggle("is-flipped", isFlipped);
    cardToggles.forEach((button) => {
      button.setAttribute("aria-pressed", isFlipped ? "true" : "false");
    });
  };

  cardToggles.forEach((button) => {
    button.addEventListener("click", () => {
      setCardFlipped(!disciplineCard?.classList.contains("is-flipped"));
    });
  });

  const TIMER_PRESETS = {
    boxing: { label: "Boxing", rounds: 3, work: 180, rest: 60 },
    muay: { label: "Muay Thai", rounds: 5, work: 180, rest: 60 },
    focus: { label: "Focus", rounds: 1, work: 1500, rest: 0 },
  };

  const TIMER_CUES = {
    boxing: {
      work: ["Breathe through the round.", "Footwork first.", "Do not rush the reset.", "Finish clean."],
      rest: ["Recover without drifting.", "Drop your shoulders.", "Find the next adjustment."],
    },
    muay: {
      work: ["Balance before power.", "Win the reset.", "Keep your eyes up.", "One clean entry."],
      rest: ["Breathe low.", "Notice what is open.", "Reset your stance."],
    },
    focus: {
      work: ["One task. No tabs.", "Ship the small version.", "Write what changed.", "Stay with the discomfort."],
      rest: ["Step away for a minute."],
    },
  };

  const ROUND_LOG_KEY = "nemath-round-log-v1";

  let activeTimerPreset = "boxing";
  let timerMode = "work";
  let activeRound = 1;
  let remainingSeconds = TIMER_PRESETS.boxing.work;
  let timerRunning = false;
  let timerInterval = null;
  let lastTimerTick = 0;
  let pendingRound = null;

  const formatSeconds = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  };

  const getTimerPreset = () => TIMER_PRESETS[activeTimerPreset] || TIMER_PRESETS.boxing;

  const readRoundLog = () => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(ROUND_LOG_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch {
      return [];
    }
  };

  const writeRoundLog = (entries) => {
    try {
      window.localStorage.setItem(ROUND_LOG_KEY, JSON.stringify(entries.slice(0, 3)));
    } catch {
      // Local storage can be unavailable in private contexts.
    }
  };

  const renderRoundLog = () => {
    if (!roundLog || !roundLogList) return;
    const entries = readRoundLog();
    roundLog.hidden = entries.length === 0;
    roundLogList.replaceChildren();
    entries.forEach((entry) => {
      const item = document.createElement("li");
      const time = document.createElement("time");
      const text = document.createElement("span");
      const date = new Date(entry.createdAt);
      time.textContent = Number.isNaN(date.getTime())
        ? "--:--"
        : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      text.textContent = entry.text;
      item.append(time, text);
      roundLogList.append(item);
    });
  };

  const getTimerCue = () => {
    const preset = getTimerPreset();
    if (timerMode === "done") return "Write one line before you leave.";
    const cueSet = TIMER_CUES[activeTimerPreset] || TIMER_CUES.boxing;
    const phaseCues = timerMode === "rest" ? cueSet.rest : cueSet.work;
    const phaseTotal = timerMode === "rest" ? preset.rest : preset.work;
    const elapsed = Math.max(0, phaseTotal - remainingSeconds);
    const cueIndex = Math.floor(elapsed / 45) % phaseCues.length;
    return phaseCues[cueIndex];
  };

  const showRoundReflection = (roundNumber, presetLabel) => {
    if (!roundReflection) return;
    pendingRound = { round: roundNumber, preset: presetLabel };
    roundReflection.hidden = false;
    if (roundInput) {
      roundInput.value = "";
    }
  };

  const hideRoundReflection = () => {
    pendingRound = null;
    if (roundReflection) roundReflection.hidden = true;
  };

  const stopRoundTimer = () => {
    timerRunning = false;
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = null;
  };

  const playTimerBell = () => {
    if (!soundEnabled) return;
    playFrequency(880, 0, 0.12);
    playFrequency(660, 0.12, 0.08);
  };

  const renderRoundTimer = () => {
    if (!timerRoot) return;
    const preset = getTimerPreset();
    const phaseTotal = timerMode === "rest" ? preset.rest : preset.work;
    const elapsed = timerMode === "done" ? phaseTotal : phaseTotal - remainingSeconds;
    const progress = phaseTotal > 0 ? Math.min(100, Math.max(0, (elapsed / phaseTotal) * 100)) : 100;

    if (timerPhase) timerPhase.textContent = timerMode === "done" ? "Done" : timerMode === "rest" ? "Rest" : "Work";
    if (timerTime) timerTime.textContent = timerMode === "done" ? "00:00" : formatSeconds(remainingSeconds);
    if (timerRound) {
      timerRound.textContent = timerMode === "done"
        ? `${preset.label} complete`
        : `Round ${activeRound} / ${preset.rounds}`;
    }
    if (timerProgress) timerProgress.style.width = `${progress}%`;
    if (timerStart) timerStart.textContent = timerRunning ? "Pause" : "Start";
    if (timerSummary) {
      timerSummary.textContent = preset.rest > 0
        ? `${preset.rounds} rounds · ${formatSeconds(preset.work)} work · ${formatSeconds(preset.rest)} rest`
        : `${preset.rounds} round · ${formatSeconds(preset.work)} work`;
    }
    if (timerCue) timerCue.textContent = getTimerCue();
    timerPresetButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.timerPreset === activeTimerPreset);
    });
  };

  const resetRoundTimer = () => {
    stopRoundTimer();
    const preset = getTimerPreset();
    timerMode = "work";
    activeRound = 1;
    remainingSeconds = preset.work;
    hideRoundReflection();
    renderRoundTimer();
  };

  const completeRoundTimer = () => {
    stopRoundTimer();
    timerMode = "done";
    remainingSeconds = 0;
    playTimerBell();
    showRoundReflection(activeRound, getTimerPreset().label);
    renderRoundTimer();
  };

  const advanceRoundTimer = () => {
    const preset = getTimerPreset();

    if (timerMode === "work") {
      if (activeRound >= preset.rounds) {
        completeRoundTimer();
        return;
      }
      playTimerBell();
      showRoundReflection(activeRound, preset.label);
      if (preset.rest > 0) {
        timerMode = "rest";
        remainingSeconds = preset.rest;
      } else {
        activeRound += 1;
        remainingSeconds = preset.work;
      }
    } else {
      playTimerBell();
      activeRound += 1;
      timerMode = "work";
      remainingSeconds = preset.work;
    }

    renderRoundTimer();
  };

  const tickRoundTimer = () => {
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - lastTimerTick) / 1000);
    if (elapsedSeconds < 1) return;
    lastTimerTick += elapsedSeconds * 1000;
    remainingSeconds = Math.max(0, remainingSeconds - elapsedSeconds);
    if (remainingSeconds === 0) advanceRoundTimer();
    else renderRoundTimer();
  };

  if (timerStart) {
    timerStart.addEventListener("click", () => {
      if (timerRunning) {
        stopRoundTimer();
        renderRoundTimer();
        return;
      }

      if (timerMode === "done") resetRoundTimer();
      ensureAudio();
      timerRunning = true;
      lastTimerTick = Date.now();
      timerInterval = window.setInterval(tickRoundTimer, 250);
      renderRoundTimer();
    });
  }

  if (timerReset) {
    timerReset.addEventListener("click", resetRoundTimer);
  }

  timerPresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeTimerPreset = button.dataset.timerPreset || activeTimerPreset;
      resetRoundTimer();
    });
  });

  if (roundForm) {
    roundForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = roundInput?.value.trim();
      if (!text) return;
      const entries = readRoundLog();
      entries.unshift({
        text,
        round: pendingRound?.round || activeRound,
        preset: pendingRound?.preset || getTimerPreset().label,
        createdAt: Date.now(),
      });
      writeRoundLog(entries);
      hideRoundReflection();
      renderRoundLog();
    });
  }

  renderRoundLog();
  renderRoundTimer();

  const startGridField = () => {
    const canvas = document.querySelector("[data-grid-field]");
    if (!canvas || prefersReducedMotion || !hasFinePointer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    document.body.classList.add("has-grid-field");

    const spacing = 42;
    const segment = 12;
    const radius = 190;
    const strength = 18;
    const pointer = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      tx: window.innerWidth / 2,
      ty: window.innerHeight / 2,
    };
    let width = 0;
    let height = 0;
    let dpr = 1;
    let intensity = 0;
    let targetIntensity = 0;
    let running = false;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const distortPoint = (x, y, amount) => {
      if (amount <= 0.001) return { x, y };
      const dx = x - pointer.x;
      const dy = y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= radius || distance < 0.001) return { x, y };
      const falloff = 1 - distance / radius;
      const wave = Math.sin(falloff * Math.PI);
      const push = wave * wave * strength * amount;
      const swirl = falloff * 7 * amount;
      const ux = dx / distance;
      const uy = dy / distance;
      return {
        x: x + ux * push - uy * swirl,
        y: y + uy * push + ux * swirl,
      };
    };

    const drawPath = (points, amount) => {
      points.forEach((point, index) => {
        const warped = distortPoint(point.x, point.y, amount);
        if (index === 0) ctx.moveTo(warped.x, warped.y);
        else ctx.lineTo(warped.x, warped.y);
      });
    };

    const drawGrid = (strokeStyle, lineWidth, amount) => {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;

      for (let x = -spacing; x <= width + spacing; x += spacing) {
        ctx.beginPath();
        const points = [];
        for (let y = -segment; y <= height + segment; y += segment) {
          points.push({ x, y });
        }
        drawPath(points, amount);
        ctx.stroke();
      }

      for (let y = -spacing; y <= height + spacing; y += spacing) {
        ctx.beginPath();
        const points = [];
        for (let x = -segment; x <= width + segment; x += segment) {
          points.push({ x, y });
        }
        drawPath(points, amount);
        ctx.stroke();
      }
    };

    function draw() {
      ctx.clearRect(0, 0, width, height);
      drawGrid("rgba(48, 95, 114, 0.055)", 1, intensity);

      if (intensity > 0.015) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.9, intensity);
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, radius * 1.05, 0, Math.PI * 2);
        ctx.clip();
        drawGrid(currentGridColor, 1.15, intensity);
        ctx.restore();
      }
    }

    const animate = () => {
      running = true;
      pointer.x += (pointer.tx - pointer.x) * 0.18;
      pointer.y += (pointer.ty - pointer.y) * 0.18;
      intensity += (targetIntensity - intensity) * 0.14;
      draw();
      if (Math.abs(targetIntensity - intensity) > 0.01 || intensity > 0.015) {
        requestAnimationFrame(animate);
      } else {
        intensity = 0;
        running = false;
        draw();
      }
    };

    const wake = () => {
      if (!running) requestAnimationFrame(animate);
    };

    document.addEventListener("pointermove", (event) => {
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
      targetIntensity = 1;
      wake();
    }, { passive: true });

    document.addEventListener("pointerleave", () => {
      targetIntensity = 0;
      wake();
    });

    window.addEventListener("resize", resize);
    resize();
  };

  startGridField();

  document.querySelectorAll(".snapshot-section, .snapshot-list > div")
    .forEach((element) => element.setAttribute("data-reveal", ""));

  if (!prefersReducedMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
  } else {
    document.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
  }

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const target = document.querySelector(anchor.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    });
  });
})();
