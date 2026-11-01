// Persona theme tables from the design handoff (design/V2Sheet.dc.html).
// Class emblems are 24×24 stroke paths; ancestry ornaments are 60×44 [stroke, fill] paths.
import type { DomainId } from '../data';

export const EMBLEMS: Record<string, string> = {
        assassin: 'M4 20c0-9 3-15 8-16 5 1 8 7 8 16M9 13c1.5-1 4.5-1 6 0M12 15v5',
        bard: 'M9 18V5l10-2v13M9 18a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0M19 16a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0',
        brawler: 'M6 11V8a2 2 0 0 1 4 0v3M10 10V7a2 2 0 0 1 4 0v3M14 10V8a2 2 0 0 1 4 0v5c0 4-3 7-6 7s-6-2-6-6v-3h5',
        druid: 'M5 19C5 10 11 5 19 5c0 8-5 14-14 14zM5 19l9-9M10 14h4M12 12V8',
        guardian: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM12 7v10M8 11h8',
        ranger: 'M7 3c6 3 6 15 0 18M7 3v18M3 12h17M17 9l3 3-3 3',
        rogue: 'M3 10c3-3 15-3 18 0-1 4-4 6-6 6-1 0-2-2-3-2s-2 2-3 2c-2 0-5-2-6-6zM8 11h2M14 11h2',
        seraph: 'M8 4a4 1.5 0 1 0 8 0a4 1.5 0 1 0-8 0M12 9v11M12 12c-3-3-7-3-9-1 2 1 4 4 9 4M12 12c3-3 7-3 9-1-2 1-4 4-9 4',
        sorcerer: 'M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 0 2 1 3 2 3 0-3 1-5 1-8z',
        warlock: 'M3 12c3-5 15-5 18 0-3 5-15 5-18 0zM9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M12 3v3M12 18v3',
        warrior: 'M4 4l12 12M20 4L8 16M14 18l4-4M10 18l-4-4M17 17l3 3M7 17l-3 3',
        witch: 'M5 11h14M6 11c0 5 2 8 6 8s6-3 6-8M8 19l-1 2M16 19l1 2M15 3a3 3 0 1 0 3 4 2.4 2.4 0 0 1-3-4z',
        wizard: 'M4 19h16M7 19l5-15 5 15M12 10.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z'
};

/** Emblem frame: ring for the first subclass, diamond for the second. */
export const FRAMES = ['M12 -3a15 15 0 1 0 .01 0z', 'M12 -3.5L27.5 12 12 27.5-3.5 12z'];

export const ORNAMENTS: Record<string, [string, string]> = {
        aetheris: ['M30 6v8M30 30v8M10 22h8M42 22h8M16 8l6 6M38 30l6 6M44 8l-6 6M16 36l6-6', 'M30 15l2.5 4.5 5 .9-3.6 3.5.8 5-4.7-2.4-4.7 2.4.8-5-3.6-3.5 5-.9z'],
        clank: ['M30 6v6M30 32v6M16 22h-6M50 22h-6M20 12l-4-4M44 36l-4-4M40 12l4-4M16 36l4-4M30 13a9 9 0 1 0 .01 0zM30 19a3 3 0 1 0 .01 0z', ''],
        drakona: ['M8 38C12 22 26 10 52 6C40 14 32 24 30 38M12 42a5 5 0 0 1 10 0M22 42a5 5 0 0 1 10 0', ''],
        dwarf: ['M20 4v28M30 4v32M40 4v28', 'M17 30h6v6h-6zM27 34h6v6h-6zM37 30h6v6h-6zM17 12h6v4h-6zM27 16h6v4h-6zM37 12h6v4h-6z'],
        earthkin: ['M6 40h48', 'M8 40l6-12 10-2 6 14zM28 40l4-16 12-4 8 20zM22 24l4-12 10 0 4 10z'],
        elf: ['M22 14v26M36 6v34M47 24v16', 'M18 40l4-26 6 26zM30 40l6-34 6 34zM43 40l4-16 5 16z'],
        emberkin: ['', 'M30 42c-10 0-14-8-11-16 2 4 5 6 5 6-1-10 4-17 11-22-1 7 7 11 7 20 0 8-4 12-12 12z'],
        faerie: ['M46 38C24 40 8 26 10 6c14 2 30 14 36 32zM46 38C36 30 24 24 16 14M46 38c-12 2-24 0-30-8', ''],
        faun: ['M14 40C10 22 22 8 38 10c10 2 12 14 4 18-6 3-12-2-9-7 2-3 6-2 6 1', ''],
        firbolg: ['M4 40l6-12 4 8 5-14 5 14 5-16 5 16 5-14 5 14 4-8 6 12', ''],
        fungril: ['M22 24v16M39 30v10M6 40h48', 'M10 24a12 9 0 0 1 24 0zM30 30a9 7 0 0 1 18 0z'],
        galapa: ['M30 4l14 8v16l-14 8-14-8V12zM30 4v32M16 12l28 16M44 12L16 28M8 40h44', ''],
        giant: ['M6 6c5 10-5 18 0 34M16 4c5 12-5 20 0 36M26 4c5 12-5 20 0 36M36 4c5 12-5 20 0 36M46 6c5 10-5 18 0 34', ''],
        gnome: ['M8 40h44', 'M14 38L32 4l12 34z'],
        goblin: ['M52 32C40 32 14 24 4 8c16 2 32 6 42 14 5 4 7 8 6 10zM44 25C34 21 22 16 14 12', ''],
        halfling: ['M8 40C20 32 34 22 52 8', 'M20 32c-2-8 4-12 10-12-1 7-4 11-10 12zM32 24c0-7 6-10 12-9-2 6-6 9-12 9zM12 38c-3-5 0-9 5-10 0 5-2 8-5 10z'],
        human: ['M10 42C14 22 30 10 52 8', 'M16 32c-6-2-8-6-7-10 5 1 8 5 7 10zM23 23c-5-3-6-8-4-11 4 2 6 6 4 11zM33 16c-4-4-4-8-1-11 3 3 4 7 1 11zM43 11c-3-4-2-8 1-10 2 3 2 7-1 10z'],
        infernis: ['', 'M10 42C8 24 16 10 34 4c-7 8-11 18-9 38zM30 42c2-13 8-21 24-25-7 6-11 14-13 25z'],
        katari: ['M28 30h28M28 36l26 6M28 24l26-6', 'M10 28L16 4l16 18z'],
        orc: ['', 'M54 42C38 42 24 32 20 4c7 12 16 22 34 26z'],
        ribbet: ['M44 4c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z', 'M4 34a24 8 0 1 0 48 0a24 8 0 1 0-48 0z'],
        simiah: ['M6 40C18 40 22 28 30 24s18 2 22-8c2-6-4-10-8-6', 'M18 36c-2-6 2-9 7-9-1 5-3 8-7 9zM34 24c0-6 4-8 9-7-1 5-4 7-9 7z'],
        skykin: ['', 'M14 36a8 8 0 0 1 2-16 11 11 0 0 1 21-3 9 9 0 0 1 13 9 6 6 0 0 1-1 10z'],
        tidekin: ['M4 18c6-6 12-6 18 0s12 6 18 0 12-6 18 0M4 30c6-6 12-6 18 0s12 6 18 0 12-6 18 0', '']
};

/** Domain icons, 24×24 stroke paths (app art, not from the source books). */
export const DOMAIN_ICONS: Record<DomainId, string> = {
  arcana: 'M12 3l2 6 6 3-6 3-2 6-2-6-6-3 6-3z',
  blade: 'M15 3h6v6L10 20l-6-6zM7 17l-3 3M5 13l6 6',
  bone: 'M8.5 6.5a2.5 2.5 0 1 0-3 3l9 9a2.5 2.5 0 1 0 3-3 2.5 2.5 0 1 0-3-3l-9-9a2.5 2.5 0 1 0 3 3',
  codex: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  dread: 'M12 3a7 7 0 0 0-7 7c0 3 2 4 2 6v4h10v-4c0-2 2-3 2-6a7 7 0 0 0-7-7zM9.5 11h.01M14.5 11h.01M10 20v-3M14 20v-3',
  grace: 'M12 20s-8-5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11z',
  midnight: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  sage: 'M5 19C5 10 11 5 19 5c0 8-5 14-14 14zM5 19l9-9',
  splendor: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  valor: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4',
};

export const TRAIT_VERBS: Record<string, [string, string, string]> = {
  agility: ['Sprint', 'Leap', 'Maneuver'],
  strength: ['Lift', 'Smash', 'Grapple'],
  finesse: ['Control', 'Hide', 'Tinker'],
  instinct: ['Perceive', 'Sense', 'Navigate'],
  presence: ['Charm', 'Perform', 'Deceive'],
  knowledge: ['Recall', 'Analyze', 'Comprehend'],
};
