// @ts-check
/**
 * Every gameplay number lives here (SPEC §18). Values are starting defaults.
 * Grouped by section: operative, stances, weapons, detection, noise, ai, scope,
 * explosions, units, structures, c4, strike, difficulty (+ engine/sim helpers).
 */
export const BALANCE = {
  sim: {
    hz: 30,               // fixed simulation rate
    scopeTimeScale: 0.2,  // world speed while scoped
    maxStepsPerFrame: 5,
    fogHz: 10,
    perceptionHz: 10,
  },

  display: {
    baseW: 480, baseH: 270,
    maxW: 560, maxH: 300,
    minW: 400, minH: 240,
    minButtonCss: 44,     // HUD buttons at least 44 CSS px
  },

  input: {
    tapMaxMs: 450,        // spec: 250 ms; presses up to the long-press threshold also count as taps (DECISIONS.md)
    tapMaxMove: 8,        // logical px
    doubleTapMs: 300,
    doubleTapDist: 24,
    longPressMs: 450,
    edgeScrollPx: 6,
    edgeScrollSpeed: 260, // px/s
    keyPanSpeed: 320,
  },

  camera: {
    followLerp: 6.0,      // 1/s
    zoomMin: 1, zoomMax: 2,
    shakeDecay: 7,
  },

  operative: {
    hp: 100,
    visionTiles: 10,
    visionPerElev: 1,
    medkitHeal: 40,
    medkitTime: 1.5,
    hitFlash: 0.18,
    lowHp: 30,
  },

  stances: {
    run:    { speed: 3.0, vis: 1.6, noise: 2.5 },
    walk:   { speed: 1.6, vis: 1.0 },
    crouch: { speed: 0, vis: 0.6, sway: 1.0, range: 8 },
    cover:  { speed: 0, vis: 0.45, visUncovered: 0.6, sway: 0.8, range: 8, coverAbsorb: 0.5 },
    hunker: { speed: 0, vis: 0.25, sway: 0.4, range: 10, enter: 1.0, exit: 0.7, hitMult: 0.5 },
    // low crawl (playtest): tap the ground while hunkered — very slow, still flat, nearly silent
    crawl:  { speed: 0.45, vis: 0.35, noiseMult: 0.5 },
    crouchAnim: 0.2,
    proneAnim: 1.0,
    coverSearchRadius: 3,
    elevRangeBonus: 1,    // per level above target
    elevRangeBonusMax: 2,
  },

  weapons: {
    rifle: { mag: 5, reload: 2.5, bolt: 1.2, noise: 12, exposure: 2.0, exposureTime: 2 },
    pistol: {
      range: 4, mag: 12, reload: 1.5, interval: 0.4, noise: 7,
      exposure: 1.5, exposureTime: 2, damage: 20,
      oneShotChance: 0.5,     // chance an infantry target needs 1 hit (else 2)
      buggyDriverChance: 0.10,
      bossHits: 4,
    },
  },

  detection: {
    decay: 0.25,
    suspicious: 0.35,
    detected: 1.0,
    instantDist: 1.2,
    tallGrassMaxDist: 3,
    waterStill: 0.75,     // concealment when still (incl. crouched) in shallow water: only head & shoulders show
    light: { day: 1.0, dusk: 0.85, night: 0.6, lit: 1.0 },
    proximityFalloff: 0.7,
    suspiciousFill: 1.3,
    sniffer: { smellDist: 3, rate: 1.5 },
    lkpSearchTime: 30,
    lkpRings: [2, 4, 6],
    alarmDetectedTime: 3,
    // how far an enemy can pick WREN out, as a share of its full sight radius (playtest 2: the inner cone).
    // Running is the outer cone; concealment (tall grass 0.5, swamp 0.8) shrinks it by (1 - conceal) * concealK.
    range: { run: 1.0, walk: 0.82, crouch: 0.5, cover: 0.45, coverUncovered: 0.5, crawl: 0.55, hunker: 0.3, concealK: 0.7 },
  },

  noise: {
    run: 2.5, shallowWater: 3, snow: 1, swamp: 2,
    pistol: 7, rifle: 12, explosion: 16, c4: 20, takedown: 1.5,
    rifleOffset: [2, 4], otherOffset: 1,
  },

  ai: {
    suspiciousToInvestigate: 2,
    investigateLook: 5,
    corpseRadioTime: 3,
    cautionDecay: 90,
    cautionVision: 0.20,
    cautionSpeed: 1.25,
    twitchPerCaution: 0.05, twitchMax: 0.15,
    alarmDecay: 60,
    alarmReinforceEvery: 20,
    officerRadioTime: 3,
    commsLocalRadius: 12,
    alertedVision: 0.15,
    coverSearch: 3,
    hit: { near: 0.6, nearDist: 3, far: 0.25, cover: 0.5, hunker: 0.5, running: 0.7, highGround: 1.15, lowGround: 0.75 },
    returnSpeed: 1.0,
    campVisionMult: 0.8,
    remanTime: 10,
    trackFollow: 10,
    vision: {
      infantry: { radius: 7, cone: 110, peripheral: 1.5, rate: 1.0 },
      officer:  { radius: 7, cone: 120, peripheral: 2.0, rate: 1.2 },
      sniffer:  { radius: 6, cone: 140, peripheral: 3.0, rate: 1.5 },
      tower:    { radius: 9, cone: 90, peripheral: 2.0, rate: 1.4, sweep: 60, sweepPeriod: 6 },
      searchlight: { radius: 10, cone: 20 },
      buggy:    { radius: 6, cone: 90, peripheral: 1.0, rate: 0.8 },
      armour:   { radius: 5, cone: 70, peripheral: 1.0, rate: 0.8 },
      turret:   { radius: 8, cone: 100, peripheral: 1.0, rate: 1.0 },
    },
    nightVision: 0.65, blizzardVision: 0.6, duskVision: 0.85,
  },

  scope: {
    openTime: 0.25,
    zoom: 4,
    panLimitTiles: 2,
    swayBase: 6,
    swayStance: { crouch: 1.0, cover: 0.8, hunker: 0.4 },
    swayFarMult: 1.5,
    swayLowHp: 1.3,
    swayHurt: 1.5, swayHurtTime: 2,
    breathMult: 0.2, breathMax: 3, gaspMult: 1.8, gaspTime: 2, breathCooldown: 4,
    dispersionStart: 0.7, dispersionMax: 3,
    headshotFreeze: 0.15,
    autoCloseDamage: 15,
    assistSway: 0.5, assistZone: 1.2,
  },

  explosions: {
    edgeFactor: 0.25,
    mult: { infantry: 1.0, vehicle: 0.7, building: 0.5 },
    chainDelay: 0.2,
    grenadeBelt: { radius: 1.5, damage: 80 },
    fuelTank: { radius: 2.5, damage: 150, fireTime: 6, fireDps: 10 },
    rocketPod: { radius: 1.5, damage: 100 },
    barrel: { radius: 2, damage: 120 },
    buggyJerrycan: { radius: 2, damage: 120 },
    fuelTruck: { radius: 3, damage: 250 },
    fuelDepot: { radius: 3, damage: 200 },
    silo: { radius: 3, damage: 220 },
    coolantCell: { radius: 2, damage: 150, buildingFrac: 0.3 },
  },

  units: {
    husk:     { hp: 50, speed: 1.3, runSpeed: 2.4, vision: 'infantry', weapon: 'huskRifle' },
    lobber:   { hp: 50, speed: 1.3, runSpeed: 2.4, vision: 'infantry', weapon: 'grenade' },
    scorcher: { hp: 70, speed: 1.2, runSpeed: 2.2, vision: 'infantry', weapon: 'flame' },
    launcher: { hp: 50, speed: 1.2, runSpeed: 2.2, vision: 'infantry', weapon: 'rocket' },
    warden:   { hp: 60, speed: 1.3, runSpeed: 2.4, vision: 'officer', weapon: 'officerPistol' },
    sniffer:  { hp: 40, speed: 2.0, runSpeed: 3.6, vision: 'sniffer', weapon: 'bite' },
    vrask:    { hp: 120, speed: 1.1, runSpeed: 2.0, vision: 'officer', weapon: 'officerPistol' },
    harvester:{ hp: 30, speed: 1.1, runSpeed: 2.2, vision: 'infantry', weapon: null },
    skitter:  { hp: 150, speed: 3.2, vision: 'buggy', weapon: 'vehicleMG' },
    hauler:   { hp: 200, speed: 2.4, vision: 'buggy', weapon: null, passengers: 6 },
    fuelHauler:{ hp: 120, speed: 2.2, vision: 'buggy', weapon: null },
    crawler:  { hp: 300, speed: 2.2, vision: 'armour', weapon: 'vehicleMG', passengers: 4 },
    brute:    { hp: 400, speed: 1.8, vision: 'armour', weapon: 'lightCannon' },
    juggernaut:{ hp: 700, speed: 1.2, vision: 'armour', weapon: 'heavyCannon' },
    medTruck: { hp: 250, speed: 2.2 },
    scientist:{ hp: 40, speed: 1.4, runLimit: 3 },
    pilot:    { hp: 40, speed: 1.4, runLimit: 3 },
    friendlyVision: 6,
    wounded: { speedMult: 0.5 },
    limbSpeedMult: 0.5,
    vehicleStopShort: 3.5, dismountDelay: 2,
    vehicleRoadMult: 1.3, vehicleShallowMult: 0.5,
    tallGrassFlatten: 30,
  },

  enemyWeapons: {
    huskRifle:     { range: 5, damage: 8, burst: 3, burstGap: 0.12, interval: 1.2 },
    grenade:       { range: 6, damage: 40, radius: 1.5, interval: 3, flight: 1.0 },
    flame:         { range: 2.5, damage: 15, interval: 0.5, cone: 40 },
    rocket:        { range: 7, damage: 30, vsVehicle: 90, interval: 3 },
    officerPistol: { range: 4, damage: 12, interval: 0.8 },
    bite:          { range: 1, damage: 18, interval: 1 },
    towerMG:       { range: 8, damage: 6, burst: 5, burstGap: 0.2, interval: 1.6 },
    turretCannon:  { range: 8, damage: 50, radius: 1, interval: 2.5 },
    vehicleMG:     { range: 6, damage: 6, burst: 4, burstGap: 0.15, interval: 1.4 },
    lightCannon:   { range: 7, damage: 60, radius: 1, interval: 3 },
    heavyCannon:   { range: 8, damage: 80, radius: 1.5, interval: 3.5 },
  },

  structures: {
    small: 600, large: 1000, spire: 3000,
    guardTower: 300, gunTurret: 500, mgNest: 200, alarmPylon: 150, wall: 400,
    rubbleBurn: 20,
    commsDishDisable: 60,
  },

  c4: {
    plantTime: 2.5,
    fuse: 10,
    radius: 2.5,
    damage: 200,
    noise: 20,
  },

  strike: {
    range: 12, rangePerElev: 1,
    jammerRadius: 14,
    channel: 6,
    channelBreakDamage: 10,
    beamSuspicionTiles: 4,
    inbound: 8,
    inner: 5, outer: 8, flash: 12,
    outerFrac: 0.6,
    blindTime: 5,
    falloutRadius: 5, falloutTime: 60, falloutDps: 4,
    revealRadius: 12, revealTime: 10,
    hardenedMult: 0.25,
  },

  // silent takedown (playtest): an unaware infantry target within reach, no ammo, barely a sound
  takedown: {
    reach: 2.0,           // tiles (playtest 2: was 1.4 — inside an enemy's 1.5-tile peripheral vision, so it was hard to reach from behind)
    lunge: 0.7,           // WREN closes to this distance during the takedown
    time: 0.6,            // s WREN is busy
    awareDet: 0.5,        // a target whose meter on WREN is at/above this (while seeing him) can't be surprised
  },

  tunnel: {
    guardFight: 2,        // extra seconds underground when a guard is inside (M6 culvert Sniffer)
    guardDamage: 18,      // the one bite it gets in before WREN deals with it
  },

  friendly: {
    followMin: 1, followMax: 3,
    freeTime: 2,
    hideTime: 3,
    convoyStopDist: 6,
    truckAmbushRange: 7,   // M4: ambushers flagged targetsTrucks only engage trucks this close
  },

  extraction: {
    callTime: 3, arrive: 10, land: 5, clearRadius: 10,
    smokeTime: 15,
  },

  terrain: {
    snowTrackLife: 60,
    blizzardEvery: 180, blizzardLength: 40,
  },

  difficulty: {
    recruit:   { detection: 0.7, damage: 0.6, sway: 0.8, zone: 1.2, alarmDecay: 45 },
    operative: { detection: 1.0, damage: 1.0, sway: 1.0, zone: 1.0, alarmDecay: 60 },
    ghost:     { detection: 1.3, damage: 1.3, sway: 1.2, zone: 0.9, alarmDecay: 90 },
  },
};

export default BALANCE;
