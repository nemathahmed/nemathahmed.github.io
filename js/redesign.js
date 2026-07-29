(() => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      accent: "#244a5a",
      soft: "rgba(36, 74, 90, .1)",
      notes: [82.41, 110.00, 164.81, 220.00, 261.63, 329.63],
      labels: ["E2", "A2", "E3", "A3", "C4", "E4"],
    },
    fsharp: {
      label: "F#m7",
      accent: "#405c66",
      soft: "rgba(64, 92, 102, .11)",
      notes: [92.50, 138.59, 164.81, 220.00, 277.18, 369.99],
      labels: ["F#2", "C#3", "E3", "A3", "C#4", "F#4"],
    },
    cmaj: {
      label: "Cmaj7",
      accent: "#536348",
      soft: "rgba(83, 99, 72, .12)",
      notes: [82.41, 130.81, 164.81, 196.00, 246.94, 329.63],
      labels: ["E2", "C3", "E3", "G3", "B3", "E4"],
    },
  };
  const CHORD_SEQUENCE = Object.keys(CHORDS);

  let audioContext = null;
  let soundEnabled = true;
  let isDragging = false;
  let lastPlayed = null;
  let activeChordKey = "am";

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

  const isTextEntryTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable]"));
  };

  const isGuitarActive = () => Boolean(guitar) && !disciplineCard?.classList.contains("is-flipped");

  const getStringForKey = (key) => {
    const normalizedKey = key.toLowerCase();
    return strings.find((button) => button.dataset.key?.toLowerCase() === normalizedKey);
  };

  const shouldLetSpaceActivateFocusedControl = (target) => {
    if (!(target instanceof Element)) return false;
    const control = target.closest("button, a");
    return Boolean(control && !control.matches("[data-chord]") && !control.closest("[data-guitar]"));
  };

  const applyChord = (key, options = { play: false }) => {
    const chord = CHORDS[key] || CHORDS.am;
    activeChordKey = key;
    root.style.setProperty("--accent", chord.accent);
    root.style.setProperty("--accent-soft", chord.soft);

    strings.forEach((button, index) => {
      const keyHint = button.dataset.key;
      button.dataset.note = String(chord.notes[index]);
      button.dataset.label = chord.labels[index];
      button.setAttribute("aria-label", `Play ${chord.labels[index]} string${keyHint ? ` with ${keyHint}` : ""}`);
      if (keyHint) button.setAttribute("aria-keyshortcuts", keyHint);
    });

    chordTabs.forEach((tab) => {
      const isActive = tab.dataset.chord === key;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    if (chordLabel) {
      chordLabel.textContent = `${chord.label} selected.`;
      chordLabel.setAttribute("aria-label", `${chord.label} selected. Press space for next chord.`);
    }

    if (options.play) {
      playStrum("down");
    }
  };

  const cycleChord = () => {
    const activeIndex = Math.max(0, CHORD_SEQUENCE.indexOf(activeChordKey));
    const nextKey = CHORD_SEQUENCE[(activeIndex + 1) % CHORD_SEQUENCE.length];
    applyChord(nextKey, { play: true });
  };

  strings.forEach((button) => {
    button.addEventListener("pointerdown", () => {
      isDragging = true;
      lastPlayed = button;
      playNote(button);
    });

    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      playNote(button);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isTextEntryTarget(event.target) ||
      !isGuitarActive()
    ) {
      return;
    }

    const isSpace = event.code === "Space" || event.key === " " || event.key === "Spacebar";
    if (isSpace) {
      if (shouldLetSpaceActivateFocusedControl(event.target)) return;
      event.preventDefault();
      cycleChord();
      return;
    }

    const stringButton = getStringForKey(event.key);
    if (!stringButton) return;
    event.preventDefault();
    playNote(stringButton);
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

  const dailyWordRoot = document.querySelector("[data-daily-word]");
  const dailyWordText = document.querySelector("[data-daily-word-text]");
  const dailyWordType = document.querySelector("[data-daily-word-type]");
  const dailyWordDate = document.querySelector("[data-daily-word-date]");
  const dailyWordDefinition = document.querySelector("[data-daily-word-definition]");
  const dailyWordExample = document.querySelector("[data-daily-word-example]");

  const DAILY_WORDS = [
    {
      word: "liminal",
      type: "adjective",
      definition: "Relating to a threshold or transition between two states.",
      example: "Use it: The quiet hour before sunrise felt liminal.",
    },
    {
      word: "lacuna",
      type: "noun",
      definition: "A blank space, missing part, or gap in a record, thought, or story.",
      example: "Use it: The old notebook had a lacuna where the best idea should have been.",
    },
    {
      word: "numinous",
      type: "adjective",
      definition: "Having a mysterious, spiritual, or awe-filled quality.",
      example: "Use it: The empty chapel had a numinous stillness.",
    },
    {
      word: "sonder",
      type: "noun",
      definition: "The realization that every stranger has a life as vivid and complex as your own.",
      example: "Use it: A crowded train can trigger a small moment of sonder.",
    },
    {
      word: "petrichor",
      type: "noun",
      definition: "The earthy smell that rises when rain falls on dry ground.",
      example: "Use it: Petrichor came through the window after the storm started.",
    },
    {
      word: "apricity",
      type: "noun",
      definition: "The warmth of the sun in winter.",
      example: "Use it: We stood outside longer than planned for the apricity.",
    },
    {
      word: "verdant",
      type: "adjective",
      definition: "Green with growing plants, or fresh and full of life.",
      example: "Use it: The trail turned verdant after a week of rain.",
    },
    {
      word: "mellifluous",
      type: "adjective",
      definition: "Smooth, sweet, and pleasant to hear.",
      example: "Use it: Her mellifluous voice made the room settle down.",
    },
    {
      word: "sillage",
      type: "noun",
      definition: "The lingering trace of a scent, impression, or presence after something passes.",
      example: "Use it: The coffee shop left a sillage of cinnamon on his coat.",
    },
    {
      word: "palimpsest",
      type: "noun",
      definition: "Something reused or altered while still showing traces of its earlier form.",
      example: "Use it: The city felt like a palimpsest of every decade that shaped it.",
    },
    {
      word: "equanimity",
      type: "noun",
      definition: "Calmness and steadiness, especially under stress.",
      example: "Use it: She answered the hard question with equanimity.",
    },
    {
      word: "resonant",
      type: "adjective",
      definition: "Deep, clear, and continuing to have meaning or emotional force.",
      example: "Use it: The final line was simple, but resonant.",
    },
    {
      word: "anodyne",
      type: "adjective",
      definition: "Soothing, inoffensive, or unlikely to provoke disagreement.",
      example: "Use it: The meeting ended with an anodyne summary.",
    },
    {
      word: "ineffable",
      type: "adjective",
      definition: "Too great, strange, or subtle to be fully expressed in words.",
      example: "Use it: The feeling after the last bell was ineffable.",
    },
    {
      word: "ephemeral",
      type: "adjective",
      definition: "Lasting for only a short time.",
      example: "Use it: The perfect light on the wall was ephemeral.",
    },
    {
      word: "salient",
      type: "adjective",
      definition: "Most noticeable, important, or relevant.",
      example: "Use it: The salient detail was buried in the second paragraph.",
    },
    {
      word: "recondite",
      type: "adjective",
      definition: "Difficult to understand because it is obscure or specialized.",
      example: "Use it: The paper made a recondite subject feel approachable.",
    },
    {
      word: "lucent",
      type: "adjective",
      definition: "Glowing with light, or clear in expression.",
      example: "Use it: The lake looked lucent at dusk.",
    },
    {
      word: "tenable",
      type: "adjective",
      definition: "Able to be defended as reasonable, logical, or workable.",
      example: "Use it: That explanation is cleaner, but not yet tenable.",
    },
    {
      word: "incandescent",
      type: "adjective",
      definition: "Glowing with heat or emotion; brilliant and intense.",
      example: "Use it: He gave an incandescent defense of the idea.",
    },
    {
      word: "ravel",
      type: "verb",
      definition: "To untangle, or to become tangled, depending on the context.",
      example: "Use it: It took an hour to ravel the argument into something clear.",
    },
    {
      word: "halcyon",
      type: "adjective",
      definition: "Calm, peaceful, and often remembered as happy.",
      example: "Use it: They talked about the halcyon weeks before the move.",
    },
    {
      word: "inchoate",
      type: "adjective",
      definition: "Just beginning and not yet fully formed.",
      example: "Use it: The plan was still inchoate, but the shape was there.",
    },
    {
      word: "tacit",
      type: "adjective",
      definition: "Understood or implied without being directly stated.",
      example: "Use it: There was a tacit agreement to keep going.",
    },
    {
      word: "votive",
      type: "adjective",
      definition: "Offered or done as an expression of devotion, hope, or gratitude.",
      example: "Use it: A row of votive candles flickered near the door.",
    },
    {
      word: "littoral",
      type: "adjective",
      definition: "Relating to the shore of a sea, lake, or river.",
      example: "Use it: The littoral path was quiet after sunset.",
    },
    {
      word: "winsome",
      type: "adjective",
      definition: "Attractive or charming in a fresh, open way.",
      example: "Use it: The sketch had a winsome looseness.",
    },
    {
      word: "sedulous",
      type: "adjective",
      definition: "Showing steady, careful, and persistent effort.",
      example: "Use it: His sedulous edits made the draft much sharper.",
    },
    {
      word: "susurrus",
      type: "noun",
      definition: "A soft whispering, rustling, or murmuring sound.",
      example: "Use it: The susurrus of rain made the room feel smaller.",
    },
    {
      word: "penumbra",
      type: "noun",
      definition: "A partial shadow, or a surrounding area where something is less clear.",
      example: "Use it: The argument lived in the penumbra between fact and memory.",
    },
    {
      word: "ebullient",
      type: "adjective",
      definition: "Cheerful, energetic, and full of excitement.",
      example: "Use it: The room turned ebullient after the announcement.",
    },
  ];

  const renderDailyWord = () => {
    if (!dailyWordRoot || DAILY_WORDS.length === 0) return;
    const today = new Date();
    const localDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const yearStart = Date.UTC(today.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((localDay - yearStart) / 86400000);
    const index = (today.getFullYear() * 372 + dayOfYear) % DAILY_WORDS.length;
    const entry = DAILY_WORDS[index];

    if (dailyWordText) dailyWordText.textContent = entry.word;
    if (dailyWordType) dailyWordType.textContent = entry.type;
    if (dailyWordDefinition) dailyWordDefinition.textContent = entry.definition;
    if (dailyWordExample) dailyWordExample.textContent = entry.example;
    if (dailyWordDate) {
      dailyWordDate.textContent = today.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });
    }
  };

  renderDailyWord();

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const target = document.querySelector(anchor.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    });
  });
})();
