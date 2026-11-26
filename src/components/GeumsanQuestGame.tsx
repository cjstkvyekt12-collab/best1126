import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { GAME_TITLE_ART_IMAGE } from '../constants/geumsan';

type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';

interface BoothZone {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  accent: string;
}

interface RainHazard {
  x: number;
  y: number;
  radius: number;
  telegraph: number;
  maxTelegraph: number;
  activeTimer: number;
  struck: boolean;
}

interface PatrolCone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface EnergyOrb {
  x: number;
  y: number;
  ttl: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface HudSnapshot {
  score: number;
  stamps: number;
  targetStamps: number;
  combo: number;
  timeLeft: number;
  hp: number;
  sector: number;
}

interface GeumsanQuestGameProps {
  onExitGame: () => void;
}

const WORLD_W = 1040;
const WORLD_H = 620;
const TARGET_STAMPS = 15;
const START_TIME = 75;
const MAX_HP = 3;
const PARTICLE_POOL_SIZE = 120;

const BOOTHS: BoothZone[] = [
  { id: 'art', label: '수련·예술', x: 185, y: 155, color: '#0F766E', accent: '#99F6E4' },
  { id: 'lib', label: '도서관', x: 520, y: 120, color: '#1D4ED8', accent: '#BFDBFE' },
  { id: 'sport', label: '체육관', x: 855, y: 165, color: '#B45309', accent: '#FDE68A' },
  { id: 'eco', label: '생태숲', x: 230, y: 470, color: '#15803D', accent: '#BBF7D0' },
  { id: 'civic', label: '봉사·진로', x: 815, y: 465, color: '#4338CA', accent: '#C7D2FE' },
];

class SoundSynth {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainPeak = 0.14,
    slideTo?: number
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playStamp(combo: number) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const base = scale[Math.min(scale.length - 1, Math.max(0, combo - 1))];
    this.playTone(base, 0.14, 'triangle', 0.16);
    window.setTimeout(() => this.playTone(base * 1.25, 0.18, 'sine', 0.12), 55);
  }

  public playDash() {
    this.playTone(260, 0.11, 'sine', 0.1, 520);
  }

  public playOrb() {
    this.playTone(740, 0.1, 'sine', 0.12, 988);
  }

  public playHit() {
    this.playTone(170, 0.22, 'sawtooth', 0.15, 75);
  }

  public playVictory() {
    [523.25, 659.25, 783.99, 1046.5].forEach((n, idx) => {
      window.setTimeout(() => this.playTone(n, 0.24, 'triangle', 0.15), idx * 90);
    });
  }
}

export function GeumsanQuestGame({ onExitGame }: GeumsanQuestGameProps) {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>({
    score: 0,
    stamps: 0,
    targetStamps: TARGET_STAMPS,
    combo: 0,
    timeLeft: START_TIME,
    hp: MAX_HP,
    sector: 1,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>('TITLE_MENU');
  const synthRef = useRef<SoundSynth | null>(null);
  const rafRef = useRef<number | null>(null);

  if (!synthRef.current) {
    synthRef.current = new SoundSynth();
  }

  const simRef = useRef({
    px: WORLD_W / 2,
    py: WORLD_H / 2 + 20,
    vx: 0,
    vy: 0,
    facingX: 1,
    facingY: 0,
    scaleX: 1,
    scaleY: 1,
    dashTimer: 0,
    dashCooldown: 0,
    dashBuffer: 0,
    invulnTimer: 0,
    hitFlash: 0,
    hitstop: 0,
    shake: 0,
    score: 0,
    stamps: 0,
    combo: 0,
    comboTimer: 0,
    timeLeft: START_TIME,
    hp: MAX_HP,
    sector: 1,
    activeBoothIdx: 0,
    rainTimer: 1.6,
    orbTimer: 5.5,
    elapsed: 0,
    rainHazards: [] as RainHazard[],
    cones: [] as PatrolCone[],
    orbs: [] as EnergyOrb[],
    particles: Array.from({ length: PARTICLE_POOL_SIZE }, (): Particle => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 4,
      color: '#ffffff',
    })),
    held: {} as Record<string, boolean>,
    justPressedSpace: false,
    lastHudSync: 0,
  });

  const spawnParticles = useCallback(
    (x: number, y: number, color: string, count: number, speed = 170) => {
      const pool = simRef.current.particles;
      let spawned = 0;
      for (let i = 0; i < pool.length && spawned < count; i++) {
        if (!pool[i].active) {
          const angle = Math.random() * Math.PI * 2;
          const mag = speed * (0.35 + Math.random() * 0.85);
          pool[i].active = true;
          pool[i].x = x;
          pool[i].y = y;
          pool[i].vx = Math.cos(angle) * mag;
          pool[i].vy = Math.sin(angle) * mag;
          pool[i].life = 0.45 + Math.random() * 0.25;
          pool[i].maxLife = pool[i].life;
          pool[i].size = 3 + Math.random() * 4;
          pool[i].color = color;
          spawned++;
        }
      }
    },
    []
  );

  const resetSimulation = useCallback(() => {
    const s = simRef.current;
    s.px = WORLD_W / 2;
    s.py = WORLD_H / 2 + 25;
    s.vx = 0;
    s.vy = 0;
    s.scaleX = 1;
    s.scaleY = 1;
    s.dashTimer = 0;
    s.dashCooldown = 0;
    s.dashBuffer = 0;
    s.invulnTimer = 0;
    s.hitFlash = 0;
    s.hitstop = 0;
    s.shake = 0;
    s.score = 0;
    s.stamps = 0;
    s.combo = 0;
    s.comboTimer = 0;
    s.timeLeft = START_TIME;
    s.hp = MAX_HP;
    s.sector = 1;
    s.activeBoothIdx = Math.floor(Math.random() * BOOTHS.length);
    s.rainTimer = 1.8;
    s.orbTimer = 5.0;
    s.elapsed = 0;
    s.rainHazards = [];
    s.orbs = [];
    s.cones = [
      { x: 350, y: 290, vx: 110, vy: 42, radius: 16 },
      { x: 690, y: 340, vx: -105, vy: -50, radius: 16 },
    ];
    s.particles.forEach((p) => {
      p.active = false;
    });
    s.held = {};
    s.justPressedSpace = false;

    setHud({
      score: 0,
      stamps: 0,
      targetStamps: TARGET_STAMPS,
      combo: 0,
      timeLeft: START_TIME,
      hp: MAX_HP,
      sector: 1,
    });
  }, []);

  const startGame = useCallback(() => {
    resetSimulation();
    stateRef.current = 'PLAYING';
    setGameState('PLAYING');
    synthRef.current?.playDash();
  }, [resetSimulation]);

  const togglePause = useCallback(() => {
    if (stateRef.current === 'PLAYING') {
      stateRef.current = 'PAUSED';
      simRef.current.held = {};
      setGameState('PAUSED');
    } else if (stateRef.current === 'PAUSED') {
      stateRef.current = 'PLAYING';
      setGameState('PLAYING');
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (synthRef.current) synthRef.current.muted = next;
      return next;
    });
  }, []);

  // Keyboard & Blur Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
          e.code
        )
      ) {
        e.preventDefault();
      }

      if (stateRef.current === 'TITLE_MENU') {
        if (e.code === 'Enter' || e.code === 'Space') {
          startGame();
        }
        return;
      }

      if (e.code === 'Escape') {
        if (stateRef.current === 'PLAYING' || stateRef.current === 'PAUSED') {
          togglePause();
        }
        return;
      }

      if (
        (stateRef.current === 'VICTORY' || stateRef.current === 'GAME_OVER') &&
        (e.code === 'Enter' || e.code === 'Space')
      ) {
        startGame();
        return;
      }

      if (stateRef.current === 'PLAYING') {
        if (e.code === 'Space' && !e.repeat) {
          simRef.current.justPressedSpace = true;
          simRef.current.dashBuffer = 0.14;
        }
        simRef.current.held[e.code] = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      simRef.current.held[e.code] = false;
    };

    const onBlur = () => {
      simRef.current.held = {};
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [startGame, togglePause]);

  // Isolated 60fps Canvas Loop
  useEffect(() => {
    let lastTs = performance.now();

    const stepSimulation = (dt: number) => {
      const s = simRef.current;
      if (stateRef.current !== 'PLAYING') return;

      if (s.hitstop > 0) {
        s.hitstop -= dt;
        return;
      }

      s.elapsed += dt;
      s.timeLeft = Math.max(0, s.timeLeft - dt);
      if (s.timeLeft <= 0) {
        stateRef.current = 'GAME_OVER';
        setGameState('GAME_OVER');
        synthRef.current?.playHit();
        return;
      }

      // Difficulty sector ramp (1 -> 2 -> 3)
      const nextSector = s.stamps >= 10 ? 3 : s.stamps >= 5 ? 2 : 1;
      if (nextSector > s.sector) {
        s.sector = nextSector;
        s.cones.push({
          x: s.sector === 2 ? 520 : 280,
          y: 310,
          vx: (s.sector % 2 === 0 ? 1 : -1) * (125 + s.sector * 15),
          vy: 65,
          radius: 16,
        });
      }

      // Timers
      if (s.dashTimer > 0) s.dashTimer -= dt;
      if (s.dashCooldown > 0) s.dashCooldown -= dt;
      if (s.dashBuffer > 0) s.dashBuffer -= dt;
      if (s.invulnTimer > 0) s.invulnTimer -= dt;
      if (s.hitFlash > 0) s.hitFlash = Math.max(0, s.hitFlash - dt * 4);
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 28);
      if (s.comboTimer > 0) {
        s.comboTimer -= dt;
        if (s.comboTimer <= 0) s.combo = 0;
      }

      // Movement Input
      let ix = 0;
      let iy = 0;
      if (s.held.KeyW || s.held.ArrowUp) iy -= 1;
      if (s.held.KeyS || s.held.ArrowDown) iy += 1;
      if (s.held.KeyA || s.held.ArrowLeft) ix -= 1;
      if (s.held.KeyD || s.held.ArrowRight) ix += 1;

      if (ix !== 0 || iy !== 0) {
        const len = Math.hypot(ix, iy);
        ix /= len;
        iy /= len;
        s.facingX = ix;
        s.facingY = iy;
      }

      // Edge-triggered Dash with input buffering
      if ((s.justPressedSpace || s.dashBuffer > 0) && s.dashCooldown <= 0) {
        s.justPressedSpace = false;
        s.dashBuffer = 0;
        s.dashTimer = 0.16;
        s.dashCooldown = 0.58;
        s.scaleX = 1.32;
        s.scaleY = 0.74;
        synthRef.current?.playDash();
        spawnParticles(s.px, s.py, '#5EEAD4', 10, 140);
      }
      s.justPressedSpace = false;

      const speed = s.dashTimer > 0 ? 590 : 275;
      const moveX = s.dashTimer > 0 ? s.facingX : ix;
      const moveY = s.dashTimer > 0 ? s.facingY : iy;
      s.vx = moveX * speed;
      s.vy = moveY * speed;

      s.px = Math.max(46, Math.min(WORLD_W - 46, s.px + s.vx * dt));
      s.py = Math.max(46, Math.min(WORLD_H - 46, s.py + s.vy * dt));

      // Relax squash & stretch smoothly
      s.scaleX += (1 - s.scaleX) * Math.min(1, dt * 12);
      s.scaleY += (1 - s.scaleY) * Math.min(1, dt * 12);

      // Active Booth Stamp Collection
      const activeBooth = BOOTHS[s.activeBoothIdx];
      const distToBooth = Math.hypot(s.px - activeBooth.x, s.py - activeBooth.y);
      if (distToBooth < 56) {
        s.stamps += 1;
        s.combo += 1;
        s.comboTimer = 7.5;
        const points = 100 + (s.combo - 1) * 35;
        s.score += points;
        s.hitstop = 0.048;
        s.shake = 5;
        s.scaleX = 1.25;
        s.scaleY = 1.25;
        spawnParticles(activeBooth.x, activeBooth.y, activeBooth.accent, 22, 220);
        spawnParticles(activeBooth.x, activeBooth.y, '#F59E0B', 10, 180);
        synthRef.current?.playStamp(s.combo);

        if (s.stamps >= TARGET_STAMPS) {
          s.score += Math.round(s.timeLeft * 15);
          stateRef.current = 'VICTORY';
          setGameState('VICTORY');
          synthRef.current?.playVictory();
        } else {
          let nextIdx = Math.floor(Math.random() * BOOTHS.length);
          if (nextIdx === s.activeBoothIdx) {
            nextIdx = (nextIdx + 1) % BOOTHS.length;
          }
          s.activeBoothIdx = nextIdx;
        }
      }

      // Spawn & Update Time/Score Orbs
      s.orbTimer -= dt;
      if (s.orbTimer <= 0 && s.orbs.length < 2) {
        s.orbTimer = 6.5;
        s.orbs.push({
          x: 130 + Math.random() * (WORLD_W - 260),
          y: 120 + Math.random() * (WORLD_H - 240),
          ttl: 9.0,
        });
      }
      for (let i = s.orbs.length - 1; i >= 0; i--) {
        const orb = s.orbs[i];
        orb.ttl -= dt;
        if (Math.hypot(s.px - orb.x, s.py - orb.y) < 34) {
          s.timeLeft = Math.min(99, s.timeLeft + 5);
          s.score += 50;
          spawnParticles(orb.x, orb.y, '#FBBF24', 14, 150);
          synthRef.current?.playOrb();
          s.orbs.splice(i, 1);
        } else if (orb.ttl <= 0) {
          s.orbs.splice(i, 1);
        }
      }

      // Spawn Telegraphed Rainstorm Hazards
      s.rainTimer -= dt;
      if (s.rainTimer <= 0) {
        s.rainTimer = Math.max(0.95, 2.35 - s.sector * 0.42);
        const aimPlayer = Math.random() < 0.65;
        const hx = aimPlayer
          ? Math.max(90, Math.min(WORLD_W - 90, s.px + (Math.random() - 0.5) * 110))
          : 120 + Math.random() * (WORLD_W - 240);
        const hy = aimPlayer
          ? Math.max(90, Math.min(WORLD_H - 90, s.py + (Math.random() - 0.5) * 110))
          : 120 + Math.random() * (WORLD_H - 240);
        const telegraphDur = Math.max(0.75, 1.15 - s.sector * 0.1);
        s.rainHazards.push({
          x: hx,
          y: hy,
          radius: 56 + s.sector * 4,
          telegraph: telegraphDur,
          maxTelegraph: telegraphDur,
          activeTimer: 0.35,
          struck: false,
        });
      }

      const applyDamage = () => {
        if (s.invulnTimer > 0 || s.dashTimer > 0) return;
        s.hp -= 1;
        s.combo = 0;
        s.invulnTimer = 1.25;
        s.hitFlash = 1;
        s.hitstop = 0.06;
        s.shake = 10;
        spawnParticles(s.px, s.py, '#EF4444', 18, 210);
        synthRef.current?.playHit();
        if (s.hp <= 0) {
          stateRef.current = 'GAME_OVER';
          setGameState('GAME_OVER');
        }
      };

      for (let i = s.rainHazards.length - 1; i >= 0; i--) {
        const h = s.rainHazards[i];
        if (h.telegraph > 0) {
          h.telegraph -= dt;
        } else {
          if (!h.struck) {
            h.struck = true;
            spawnParticles(h.x, h.y, '#60A5FA', 14, 150);
          }
          h.activeTimer -= dt;
          if (Math.hypot(s.px - h.x, s.py - h.y) < h.radius - 8) {
            applyDamage();
          }
          if (h.activeTimer <= 0) {
            s.rainHazards.splice(i, 1);
          }
        }
      }

      // Patrol Cones
      const speedMult = 1 + (s.sector - 1) * 0.18;
      for (const c of s.cones) {
        c.x += c.vx * speedMult * dt;
        c.y += c.vy * speedMult * dt;
        if (c.x < 70 || c.x > WORLD_W - 70) c.vx *= -1;
        if (c.y < 70 || c.y > WORLD_H - 70) c.vy *= -1;
        if (Math.hypot(s.px - c.x, s.py - c.y) < c.radius + 16) {
          applyDamage();
        }
      }

      // Update Particles
      for (const p of s.particles) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
      }

      // Throttled HUD sync (~12Hz)
      if (s.elapsed - s.lastHudSync >= 0.08) {
        s.lastHudSync = s.elapsed;
        setHud({
          score: s.score,
          stamps: s.stamps,
          targetStamps: TARGET_STAMPS,
          combo: s.combo,
          timeLeft: Math.ceil(s.timeLeft),
          hp: s.hp,
          sector: s.sector,
        });
      }
    };

    const drawWorld = (ctx: CanvasRenderingContext2D) => {
      const s = simRef.current;
      ctx.save();

      if (s.shake > 0.2) {
        const ox = (Math.random() - 0.5) * s.shake * 2;
        const oy = (Math.random() - 0.5) * s.shake * 2;
        ctx.translate(ox, oy);
      }

      // 1. Lush Geumsan Valley Park Ground (60% calm felt-emerald tone)
      ctx.fillStyle = '#0F4C3A';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      // Subtle meadow contour grid
      ctx.fillStyle = '#135A45';
      ctx.beginPath();
      ctx.roundRect(26, 26, WORLD_W - 52, WORLD_H - 52, 24);
      ctx.fill();

      // Winding stone plaza paths connecting the 5 booths
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 34;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(BOOTHS[0].x, BOOTHS[0].y);
      ctx.lineTo(BOOTHS[1].x, BOOTHS[1].y);
      ctx.lineTo(BOOTHS[2].x, BOOTHS[2].y);
      ctx.lineTo(BOOTHS[4].x, BOOTHS[4].y);
      ctx.lineTo(BOOTHS[3].x, BOOTHS[3].y);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.moveTo(BOOTHS[0].x, BOOTHS[0].y);
      ctx.lineTo(WORLD_W / 2, WORLD_H / 2 + 15);
      ctx.lineTo(BOOTHS[4].x, BOOTHS[4].y);
      ctx.moveTo(BOOTHS[2].x, BOOTHS[2].y);
      ctx.lineTo(WORLD_W / 2, WORLD_H / 2 + 15);
      ctx.lineTo(BOOTHS[3].x, BOOTHS[3].y);
      ctx.stroke();

      // Central Plaza Medallion
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.arc(WORLD_W / 2, WORLD_H / 2 + 15, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0F766E';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#0F766E';
      ctx.font = '700 12px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('금산 중앙 광장', WORLD_W / 2, WORLD_H / 2 + 19);

      // 2. Activity Booths
      BOOTHS.forEach((b, idx) => {
        const isTarget = idx === s.activeBoothIdx;
        if (isTarget) {
          const pulse = 1 + Math.sin(s.elapsed * 7) * 0.1;
          ctx.strokeStyle = '#FBBF24';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 50 * pulse, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 48, 0, Math.PI * 2);
          ctx.fill();
        }

        // Pavilion roof box
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.roundRect(b.x - 42, b.y - 26, 84, 52, 12);
        ctx.fill();
        ctx.strokeStyle = isTarget ? '#FEF08A' : '#FFFFFF';
        ctx.lineWidth = isTarget ? 3 : 2;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 13px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x, b.y + 5);

        if (isTarget) {
          ctx.fillStyle = '#FDE047';
          ctx.font = '700 11px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
          ctx.fillText('★ 스탬프!', b.x, b.y - 34);
        }
      });

      // 3. Time/Score Energy Orbs
      for (const orb of s.orbs) {
        const bob = Math.sin(s.elapsed * 6) * 3;
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(orb.x, orb.y + bob, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FEF3C7';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('+5s', orb.x, orb.y + bob + 3.5);
      }

      // 4. Telegraphed Rainstorm Hazards
      for (const h of s.rainHazards) {
        if (h.telegraph > 0) {
          const progress = 1 - h.telegraph / h.maxTelegraph;
          ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(147, 197, 253, 0.85)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Expanding inner warning ring
          ctx.strokeStyle = '#FBBF24';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.radius * progress, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(37, 99, 235, 0.45)';
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#DBEAFE';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }

      // 5. Patrol Cones
      for (const c of s.cones) {
        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(c.x - 8, c.y - 2.5, 16, 5);
      }

      // 6. Player Character (Youth Explorer with squash & stretch)
      ctx.save();
      ctx.translate(s.px, s.py);
      ctx.scale(s.scaleX, s.scaleY);

      if (s.invulnTimer > 0 && Math.floor(s.elapsed * 16) % 2 === 0) {
        ctx.globalAlpha = 0.45;
      }

      // Drop shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 14, 15, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = s.dashTimer > 0 ? '#5EEAD4' : '#F8FAFC';
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0F766E';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Explorer Cap Visor / Direction indicator
      ctx.fillStyle = '#0F766E';
      ctx.beginPath();
      ctx.arc(s.facingX * 7, s.facingY * 7, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // 7. Pooled Particles
      for (const p of s.particles) {
        if (!p.active) continue;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Hit Flash Overlay
      if (s.hitFlash > 0) {
        ctx.fillStyle = `rgba(239, 68, 68, ${s.hitFlash * 0.25})`;
        ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      }

      ctx.restore();
    };

    const loop = (now: number) => {
      const rawDt = (now - lastTs) / 1000;
      lastTs = now;
      const dt = Math.min(rawDt, 0.05);

      stepSimulation(dt);

      const canvas = canvasRef.current;
      if (canvas && stateRef.current !== 'TITLE_MENU') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawWorld(ctx);
        }
      }

      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [spawnParticles]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center overflow-hidden select-none">
      {/* TITLE SCREEN */}
      {gameState === 'TITLE_MENU' && (
        <div className="relative w-full h-full overflow-hidden flex items-center">
          <img
            src={GAME_TITLE_ART_IMAGE}
            alt="금산 유스 퀘스트 게임 배경 일러스트"
            className="absolute inset-0 w-full h-full object-cover scale-105 transition-transform duration-700"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-slate-950/88 via-slate-950/55 to-slate-950/20"
          />

          <div className="relative z-10 w-full max-w-6xl mx-auto px-8 md:px-14 flex flex-col items-start gap-7">
            <button
              type="button"
              onClick={onExitGame}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              활동 지도로 돌아가기
            </button>

            {/* Bespoke inline SVG Title Lockup */}
            <svg
              viewBox="0 0 540 120"
              className="w-full max-w-[480px] h-auto"
              role="img"
              aria-label="금산 유스 퀘스트"
            >
              <defs>
                <linearGradient id="questTitleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="100%" stopColor="#99F6E4" />
                </linearGradient>
              </defs>
              <text
                x="0"
                y="34"
                fill="#5EEAD4"
                fontSize="16"
                fontWeight="700"
                letterSpacing="3"
                fontFamily="Plus Jakarta Sans, Noto Sans KR, sans-serif"
              >
                GEUMSAN YOUTH STAMP RUSH
              </text>
              <text
                x="0"
                y="98"
                fill="url(#questTitleGrad)"
                fontSize="58"
                fontWeight="800"
                letterSpacing="-1.5"
                fontFamily="Plus Jakarta Sans, Noto Sans KR, sans-serif"
              >
                금산 유스 퀘스트
              </text>
            </svg>

            <p className="text-sm md:text-base text-slate-200 max-w-md leading-relaxed">
              소나기 구름과 장애물을 피해 금산 5대 청소년 활동 공간(수련·예술,
              도서관, 체육관, 생태숲, 봉사·진로)을 누비며 스탬프 {TARGET_STAMPS}
              개를 모아 보세요.
            </p>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={startGame}
                className="px-7 py-3.5 text-base font-bold text-slate-950 bg-teal-300 hover:bg-teal-200 rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Play className="w-5 h-5 fill-slate-950" />
                게임 시작
              </button>

              <button
                type="button"
                onClick={toggleMute}
                className="px-4 py-3.5 text-xs font-semibold text-white bg-slate-900/75 border border-slate-600 hover:bg-slate-800 rounded-xl inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {muted ? (
                  <>
                    <VolumeX className="w-4 h-4" />
                    음소거
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    사운드 켜짐
                  </>
                )}
              </button>
            </div>

            {/* Single Flat Control Hint Line */}
            <div className="text-xs font-mono text-slate-300 tracking-wide">
              WASD / 방향키 이동 · Space 대시 및 회피 · Esc 일시정지
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE PLAYFIELD SHELL */}
      {gameState !== 'TITLE_MENU' && (
        <div className="relative w-full h-full flex items-center justify-center bg-[#092E24] p-2 sm:p-4">
          <canvas
            ref={canvasRef}
            width={WORLD_W}
            height={WORLD_H}
            className="w-full h-full max-w-[1180px] max-h-[700px] object-contain rounded-xl shadow-2xl border border-emerald-900/80 bg-[#0F4C3A]"
          />

          {/* Perimeter World-Matched HUD (pointer-events-none wrapper, no backdrop-filter) */}
          <div className="pointer-events-none fixed inset-x-0 top-0 p-3 sm:p-4 flex items-center justify-between gap-4 max-w-[1220px] mx-auto">
            <div className="flex items-center gap-4 bg-slate-950/90 border border-emerald-800/80 rounded-lg px-4 py-2 text-xs text-slate-100">
              <div>
                <span className="text-emerald-300 mr-1.5">스탬프</span>
                <span className="font-mono font-bold text-sm tabular-nums">
                  {hud.stamps}/{hud.targetStamps}
                </span>
              </div>
              <span className="text-slate-700">|</span>
              <div>
                <span className="text-amber-300 mr-1.5">점수</span>
                <span className="font-mono font-bold text-sm tabular-nums">
                  {hud.score}
                </span>
              </div>
              <span className="text-slate-700">|</span>
              <div>
                <span className="text-sky-300 mr-1.5">콤보</span>
                <span className="font-mono font-bold text-sm tabular-nums">
                  x{hud.combo}
                </span>
              </div>
              <span className="text-slate-700 hidden sm:inline">|</span>
              <div className="hidden sm:block">
                <span className="text-slate-400 mr-1.5">단계</span>
                <span className="font-mono font-bold text-sm tabular-nums">
                  S{hud.sector}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-4 bg-slate-950/90 border border-emerald-800/80 rounded-lg px-4 py-2 text-xs text-slate-100">
                <div>
                  <span className="text-slate-400 mr-1.5">남은 시간</span>
                  <span
                    className={`font-mono font-bold text-sm tabular-nums ${
                      hud.timeLeft <= 15 ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {hud.timeLeft}s
                  </span>
                </div>
                <span className="text-slate-700">|</span>
                <div>
                  <span className="text-slate-400 mr-1.5">체력</span>
                  <span className="font-mono font-bold text-sm tabular-nums text-emerald-300">
                    {hud.hp}/{MAX_HP}
                  </span>
                </div>
              </div>

              <div className="pointer-events-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? '사운드 켜기' : '음소거'}
                  className="p-2 bg-slate-950/90 border border-emerald-800/80 text-slate-200 hover:text-white rounded-lg cursor-pointer"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={togglePause}
                  aria-label="일시정지"
                  className="p-2 bg-slate-950/90 border border-emerald-800/80 text-slate-200 hover:text-white rounded-lg cursor-pointer"
                >
                  <Pause className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom-center quiet control reminder */}
          <div className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-mono text-emerald-200/80 bg-slate-950/80 px-3 py-1 rounded">
            WASD / 방향키 이동 · Space 대시(무적 회피) · Esc 일시정지
          </div>

          {/* PAUSE / VICTORY / GAME OVER MODALS */}
          {(gameState === 'PAUSED' ||
            gameState === 'VICTORY' ||
            gameState === 'GAME_OVER') && (
            <div className="fixed inset-0 bg-slate-950/75 flex items-center justify-center p-4 z-50">
              <div className="bg-slate-900 border border-emerald-800/80 rounded-2xl max-w-md w-full p-7 text-center space-y-5 shadow-2xl">
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-teal-300">
                    {gameState === 'PAUSED'
                      ? 'PAUSED'
                      : gameState === 'VICTORY'
                        ? 'MISSION COMPLETE'
                        : 'TIME OVER / GAME OVER'}
                  </div>
                  <h2 className="text-2xl font-bold text-white">
                    {gameState === 'PAUSED'
                      ? '잠시 쉬어가는 중'
                      : gameState === 'VICTORY'
                        ? '금산 활동 스탬프 투어 완주!'
                        : '아쉬워요, 다시 도전해 볼까요?'}
                  </h2>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs">
                  <div>
                    <div className="text-slate-400">최종 점수</div>
                    <div className="text-lg font-bold text-amber-300 font-mono tabular-nums mt-0.5">
                      {hud.score}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">획득 스탬프</div>
                    <div className="text-lg font-bold text-teal-300 font-mono tabular-nums mt-0.5">
                      {hud.stamps}/{TARGET_STAMPS}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">남은 시간</div>
                    <div className="text-lg font-bold text-white font-mono tabular-nums mt-0.5">
                      {hud.timeLeft}s
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
                  {gameState === 'PAUSED' ? (
                    <button
                      type="button"
                      onClick={togglePause}
                      className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-slate-950 bg-teal-300 hover:bg-teal-200 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      계속 플레이
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startGame}
                      className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-slate-950 bg-teal-300 hover:bg-teal-200 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-4 h-4" />
                      다시 플레이
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onExitGame}
                    className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    활동 지도로 나가기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
