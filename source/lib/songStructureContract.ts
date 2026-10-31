// Song section types with their associated colors
export type SectionType =
  | "intro"
  | "verse"
  | "pre-chorus"
  | "chorus"
  | "post-chorus"
  | "hook"
  | "bridge"
  | "breakdown"
  | "drop"
  | "build"
  | "outro"
  | "solo"
  | "riff"
  | "interlude"

export interface SongSection {
  type: SectionType
  label: string
}

export interface SongStructure {
  id: string
  name: string
  description: string
  sections: SongSection[]
}

export interface Genre {
  id: string
  name: string
  description: string
  structures: SongStructure[]
}

// Color definitions — solid bg + readable text on both dark and light surfaces
export const sectionColors: Record<SectionType, { bg: string; text: string }> = {
  intro:         { bg: "#CB7B37", text: "#ffffff" },
  verse:         { bg: "#C29A56", text: "#1a1a1a" },
  "pre-chorus":  { bg: "#8B7355", text: "#ffffff" },
  chorus:        { bg: "#BE524B", text: "#ffffff" },
  "post-chorus": { bg: "#D4726A", text: "#ffffff" },
  hook:          { bg: "#BE524B", text: "#ffffff" },
  bridge:        { bg: "#4A9B7F", text: "#ffffff" },
  breakdown:     { bg: "#5A7A9A", text: "#ffffff" },
  drop:          { bg: "#7B5EA7", text: "#ffffff" },
  build:         { bg: "#3A8FD4", text: "#ffffff" },
  outro:         { bg: "#7A7A7A", text: "#ffffff" },
  solo:          { bg: "#C47B9A", text: "#ffffff" },
  riff:          { bg: "#6B8E4E", text: "#ffffff" },
  interlude:     { bg: "#5B7A8A", text: "#ffffff" },
}

export const sectionLabels: Record<SectionType, string> = {
  intro: "Intro",
  verse: "Verse",
  "pre-chorus": "Pre-Chorus",
  chorus: "Chorus",
  "post-chorus": "Post-Chorus",
  hook: "Hook",
  bridge: "Bridge",
  breakdown: "Breakdown",
  drop: "Drop",
  build: "Build",
  outro: "Outro",
  solo: "Solo",
  riff: "Riff",
  interlude: "Interlude",
}

// Genre definitions with song structures
export const genres: Genre[] = [
  {
    id: "hip-hop",
    name: "Hip-Hop",
    description: "Classic hip-hop song structures",
    structures: [
      {
        id: "hip-hop-a",
        name: "Classic Hip-Hop",
        description: "The tried and tested intro-hook-verse format. Opens with a scene-setting intro before the hook draws listeners in, then verses carry the narrative. Works for almost any lyrical style.",
        sections: [
          { type: "intro",   label: "Intro"    },
          { type: "chorus",  label: "Chorus"   },
          { type: "verse",   label: "Verse 1"  },
          { type: "chorus",  label: "Chorus"   },
          { type: "verse",   label: "Verse 2"  },
          { type: "chorus",  label: "Chorus"   },
          { type: "bridge",  label: "Bridge"   },
          { type: "chorus",  label: "Chorus"   },
          { type: "outro",   label: "Outro"    },
        ],
      },
      {
        id: "hip-hop-b",
        name: "Verse Heavy",
        description: "Lets the bars breathe. Three verses give space for storytelling or technical lyricism before the hook pays off. Ideal for concept tracks or lyricists who want room to flex.",
        sections: [
          { type: "intro",   label: "Intro"    },
          { type: "verse",   label: "Verse 1"  },
          { type: "verse",   label: "Verse 2"  },
          { type: "chorus",  label: "Chorus"   },
          { type: "verse",   label: "Verse 3"  },
          { type: "chorus",  label: "Chorus"   },
          { type: "outro",   label: "Outro"    },
        ],
      },
      {
        id: "hip-hop-c",
        name: "Hook Driven",
        description: "Built around a memorable hook that hits first and hits hard. Verses serve as contrast between repeated hooks. Great for radio-friendly tracks where the hook IS the song.",
        sections: [
          { type: "chorus",  label: "Hook"     },
          { type: "verse",   label: "Verse 1"  },
          { type: "chorus",  label: "Hook"     },
          { type: "verse",   label: "Verse 2"  },
          { type: "chorus",  label: "Hook"     },
          { type: "verse",   label: "Verse 3"  },
          { type: "chorus",  label: "Hook"     },
        ],
      },
      {
        id: "hip-hop-d",
        name: "Story Rap",
        description: "Three-act narrative structure. Each verse advances the story while the chorus provides the emotional anchor or theme statement. Perfect for concept tracks and personal storytelling.",
        sections: [
          { type: "intro",   label: "Intro"    },
          { type: "verse",   label: "Verse 1"  },
          { type: "chorus",  label: "Chorus"   },
          { type: "verse",   label: "Verse 2"  },
          { type: "chorus",  label: "Chorus"   },
          { type: "verse",   label: "Verse 3"  },
          { type: "outro",   label: "Outro"    },
        ],
      },
    ],
  },
  {
    id: "modern-rap",
    name: "Modern Rap",
    description: "Contemporary trap and rap structures",
    structures: [
      {
        id: "modern-rap-a",
        name: "Trap Standard",
        description: "The contemporary trap blueprint. Short punchy hook leads the way with verses filling the gaps. The bridge adds a dynamic shift before the final hook lands. Think SZA, Travis, Future.",
        sections: [
          { type: "intro",   label: "Intro"    },
          { type: "chorus",  label: "Hook"     },
          { type: "verse",   label: "Verse 1"  },
          { type: "chorus",  label: "Hook"     },
          { type: "verse",   label: "Verse 2"  },
          { type: "chorus",  label: "Hook"     },
          { type: "bridge",  label: "Bridge"   },
          { type: "chorus",  label: "Hook"     },
        ],
      },
      {
        id: "modern-rap-b",
        name: "Melodic Rap",
        description: "Blends sung choruses with rapped verses. The chorus carries melodic weight while verses deliver wordplay. Common in emo rap and melodic trap — Drake, Juice WRLD, Rod Wave territory.",
        sections: [
          { type: "intro",   label: "Intro"    },
          { type: "chorus",  label: "Chorus"   },
          { type: "verse",   label: "Verse 1"  },
          { type: "chorus",  label: "Chorus"   },
          { type: "verse",   label: "Verse 2"  },
          { type: "chorus",  label: "Chorus"   },
          { type: "outro",   label: "Outro"    },
        ],
      },
      {
        id: "modern-rap-c",
        name: "Short Form",
        description: "Streamlined for the streaming era — tight, no filler. Under 3 minutes with no intro or outro. Built for replay value and playlist placement. Great for SoundCloud drops or EP cuts.",
        sections: [
          { type: "chorus",  label: "Hook"     },
          { type: "verse",   label: "Verse 1"  },
          { type: "chorus",  label: "Hook"     },
          { type: "verse",   label: "Verse 2"  },
          { type: "chorus",  label: "Hook"     },
        ],
      },
      {
        id: "modern-rap-d",
        name: "Feature Ready",
        description: "Designed for collabs. Two distinct verse slots give each artist their moment while a shared hook unifies the track. The bridge can be split or taken solo. Built-in for a feature credit.",
        sections: [
          { type: "intro",   label: "Intro"          },
          { type: "verse",   label: "Artist 1 Verse" },
          { type: "chorus",  label: "Hook"           },
          { type: "verse",   label: "Artist 2 Verse" },
          { type: "chorus",  label: "Hook"           },
          { type: "bridge",  label: "Breakdown"      },
          { type: "chorus",  label: "Hook"           },
        ],
      },
    ],
  },
  {
    id: "modern-pop",
    name: "Modern Pop",
    description: "Contemporary pop song structures",
    structures: [
      {
        id: "modern-pop-a",
        name: "Standard Pop",
        description: "The backbone of modern pop. The pre-chorus builds tension before the chorus explodes. Bridge offers contrast and relief before the final payoff chorus. Used in countless charting pop songs.",
        sections: [
          { type: "intro",        label: "Intro"       },
          { type: "verse",        label: "Verse 1"     },
          { type: "pre-chorus",   label: "Pre-Chorus"  },
          { type: "chorus",       label: "Chorus"      },
          { type: "verse",        label: "Verse 2"     },
          { type: "pre-chorus",   label: "Pre-Chorus"  },
          { type: "chorus",       label: "Chorus"      },
          { type: "bridge",       label: "Bridge"      },
          { type: "chorus",       label: "Chorus"      },
          { type: "outro",        label: "Outro"       },
        ],
      },
      {
        id: "modern-pop-b",
        name: "Post-Chorus Hit",
        description: "Adds a post-chorus hook after each chorus for extra momentum — the ear gets an extra reward every time. Common in Billie Eilish, Dua Lipa style productions. Great for earworm potential.",
        sections: [
          { type: "verse",        label: "Verse 1"     },
          { type: "pre-chorus",   label: "Pre-Chorus"  },
          { type: "chorus",       label: "Chorus"      },
          { type: "post-chorus",  label: "Post-Chorus" },
          { type: "verse",        label: "Verse 2"     },
          { type: "pre-chorus",   label: "Pre-Chorus"  },
          { type: "chorus",       label: "Chorus"      },
          { type: "post-chorus",  label: "Post-Chorus" },
          { type: "bridge",       label: "Bridge"      },
          { type: "chorus",       label: "Chorus"      },
          { type: "post-chorus",  label: "Post-Chorus" },
        ],
      },
      {
        id: "modern-pop-c",
        name: "Minimal Pop",
        description: "Stripped back and punchy. Starts with the chorus to hook immediately, no intro padding. Lean structure with no bridge — just verses providing contrast. Great for short, sharp releases.",
        sections: [
          { type: "chorus",  label: "Chorus"       },
          { type: "verse",   label: "Verse 1"      },
          { type: "chorus",  label: "Chorus"       },
          { type: "verse",   label: "Verse 2"      },
          { type: "chorus",  label: "Chorus"       },
          { type: "chorus",  label: "Final Chorus" },
        ],
      },
      {
        id: "modern-pop-d",
        name: "Anthem Build",
        description: "Designed to crescendo. A breakdown strips everything back before the final chorus erupts with full energy. That contrast is what makes it feel anthemic. Think stadium and festival closers.",
        sections: [
          { type: "intro",      label: "Intro"         },
          { type: "verse",      label: "Verse 1"       },
          { type: "chorus",     label: "Chorus"        },
          { type: "verse",      label: "Verse 2"       },
          { type: "chorus",     label: "Chorus"        },
          { type: "bridge",     label: "Bridge"        },
          { type: "breakdown",  label: "Breakdown"     },
          { type: "chorus",     label: "Final Chorus"  },
        ],
      },
    ],
  },
  {
    id: "trad-pop",
    name: "Traditional Pop",
    description: "Classic pop and Tin Pan Alley structures",
    structures: [
      {
        id: "trad-pop-a",
        name: "ABABCB Form",
        description: "The classic Tin Pan Alley blueprint. Verse-chorus alternation with a bridge providing harmonic and emotional contrast before the final chorus resolution. Timeless and familiar to any listener.",
        sections: [
          { type: "verse",   label: "Verse 1" },
          { type: "chorus",  label: "Chorus"  },
          { type: "verse",   label: "Verse 2" },
          { type: "chorus",  label: "Chorus"  },
          { type: "bridge",  label: "Bridge"  },
          { type: "chorus",  label: "Chorus"  },
        ],
      },
      {
        id: "trad-pop-b",
        name: "Verse-Chorus Extended",
        description: "Three verses give the lyric plenty of room to develop before each chorus lands. The outro carries the chorus out, often with vocal ad-libs. Great for storytelling over a strong melodic hook.",
        sections: [
          { type: "intro",   label: "Intro"   },
          { type: "verse",   label: "Verse 1" },
          { type: "chorus",  label: "Chorus"  },
          { type: "verse",   label: "Verse 2" },
          { type: "chorus",  label: "Chorus"  },
          { type: "verse",   label: "Verse 3" },
          { type: "chorus",  label: "Chorus"  },
          { type: "outro",   label: "Outro"   },
        ],
      },
      {
        id: "trad-pop-c",
        name: "Ballad",
        description: "Emotional arc from quiet to full. The bridge delivers the song's emotional peak before the final chorus brings everything home. Suited to piano, string, or acoustic led productions.",
        sections: [
          { type: "intro",   label: "Intro"        },
          { type: "verse",   label: "Verse 1"      },
          { type: "chorus",  label: "Chorus"       },
          { type: "verse",   label: "Verse 2"      },
          { type: "chorus",  label: "Chorus"       },
          { type: "bridge",  label: "Bridge"       },
          { type: "chorus",  label: "Final Chorus" },
        ],
      },
      {
        id: "trad-pop-d",
        name: "Radio Edit",
        description: "No-nonsense and front-loaded. Opens with the chorus to grab attention in the first five seconds. Lean on verses for contrast, then close with a double chorus for added emphasis. Built for radio.",
        sections: [
          { type: "chorus",  label: "Chorus"        },
          { type: "verse",   label: "Verse 1"       },
          { type: "chorus",  label: "Chorus"        },
          { type: "verse",   label: "Verse 2"       },
          { type: "chorus",  label: "Double Chorus" },
        ],
      },
    ],
  },
  {
    id: "edm",
    name: "EDM",
    description: "Electronic dance music structures",
    structures: [
      {
        id: "edm-a",
        name: "Festival Banger",
        description: "Classic big room EDM format. Two drop cycles with a breakdown and build in between for maximum floor energy. No vocals needed — the drop IS the hook. Built for festival main stages.",
        sections: [
          { type: "intro",      label: "Intro"      },
          { type: "build",      label: "Build"      },
          { type: "drop",       label: "Drop"       },
          { type: "breakdown",  label: "Breakdown"  },
          { type: "build",      label: "Build 2"    },
          { type: "drop",       label: "Drop 2"     },
          { type: "outro",      label: "Outro"      },
        ],
      },
      {
        id: "edm-b",
        name: "Vocal EDM",
        description: "Combines song structure with EDM energy. Verses establish the lyric before the build launches into the drop. Crossover-friendly — sits comfortably in both pop and dance charts.",
        sections: [
          { type: "intro",      label: "Intro"     },
          { type: "verse",      label: "Verse"     },
          { type: "build",      label: "Build"     },
          { type: "drop",       label: "Drop"      },
          { type: "verse",      label: "Verse 2"   },
          { type: "build",      label: "Build 2"   },
          { type: "drop",       label: "Drop 2"    },
          { type: "outro",      label: "Outro"     },
        ],
      },
      {
        id: "edm-c",
        name: "Progressive House",
        description: "Slow-burn build with a long breakdown before the final drop hits hardest. Patience is the point — the journey makes the payoff feel earned. Influenced by Eric Prydz, Deadmau5 style production.",
        sections: [
          { type: "intro",      label: "Intro"       },
          { type: "build",      label: "Build"       },
          { type: "drop",       label: "Main Drop"   },
          { type: "breakdown",  label: "Breakdown"   },
          { type: "build",      label: "Build 2"     },
          { type: "drop",       label: "Final Drop"  },
          { type: "outro",      label: "Outro"       },
        ],
      },
      {
        id: "edm-d",
        name: "Bass House",
        description: "Drop-heavy with minimal build-up. Three drops with breaks in between keep the floor locked in. Lean and punchy — suited to club sets where the energy never really drops below high.",
        sections: [
          { type: "intro",      label: "Intro"       },
          { type: "drop",       label: "Drop 1"      },
          { type: "breakdown",  label: "Breakdown"   },
          { type: "build",      label: "Build"       },
          { type: "drop",       label: "Drop 2"      },
          { type: "breakdown",  label: "Break"       },
          { type: "drop",       label: "Final Drop"  },
          { type: "outro",      label: "Outro"       },
        ],
      },
    ],
  },
  {
    id: "rock",
    name: "Rock",
    description: "Classic and modern rock structures",
    structures: [
      {
        id: "rock-a",
        name: "Arena Rock",
        description: "Built for big rooms. The guitar solo is the centrepiece — a moment to let the lead player shine before the final chorus lifts the roof. Think Bon Jovi, Foo Fighters, classic stadium rock.",
        sections: [
          { type: "intro",   label: "Intro"        },
          { type: "verse",   label: "Verse 1"      },
          { type: "chorus",  label: "Chorus"       },
          { type: "verse",   label: "Verse 2"      },
          { type: "chorus",  label: "Chorus"       },
          { type: "solo",    label: "Guitar Solo"  },
          { type: "chorus",  label: "Final Chorus" },
          { type: "outro",   label: "Outro"        },
        ],
      },
      {
        id: "rock-b",
        name: "Riff Rock",
        description: "The main riff IS the identity of the song — it bookends sections and keeps returning. Great for guitar-driven tracks where the riff is more recognisable than the vocal line. Think AC/DC, Sabbath.",
        sections: [
          { type: "riff",    label: "Main Riff"    },
          { type: "verse",   label: "Verse 1"      },
          { type: "riff",    label: "Riff"         },
          { type: "chorus",  label: "Chorus"       },
          { type: "verse",   label: "Verse 2"      },
          { type: "chorus",  label: "Chorus"       },
          { type: "solo",    label: "Solo"         },
          { type: "riff",    label: "Riff"         },
          { type: "chorus",  label: "Chorus"       },
        ],
      },
      {
        id: "rock-c",
        name: "Power Ballad",
        description: "Starts soft, builds slow, ends massive. The bridge delivers emotional weight before the guitar solo ignites the climax. Final chorus with full band is the payoff. Classic 80s rock DNA.",
        sections: [
          { type: "intro",   label: "Intro"        },
          { type: "verse",   label: "Verse 1"      },
          { type: "chorus",  label: "Chorus"       },
          { type: "verse",   label: "Verse 2"      },
          { type: "chorus",  label: "Chorus"       },
          { type: "bridge",  label: "Bridge"       },
          { type: "solo",    label: "Guitar Solo"  },
          { type: "chorus",  label: "Final Chorus" },
        ],
      },
      {
        id: "rock-d",
        name: "Punk / Alt Rock",
        description: "Fast, efficient, and direct. No solos, no frills — just verse, chorus, bridge, repeat. The bridge cuts through the pattern before the final chorus brings it home. Green Day, Paramore, The Clash.",
        sections: [
          { type: "intro",   label: "Intro"   },
          { type: "verse",   label: "Verse 1" },
          { type: "chorus",  label: "Chorus"  },
          { type: "verse",   label: "Verse 2" },
          { type: "chorus",  label: "Chorus"  },
          { type: "bridge",  label: "Bridge"  },
          { type: "chorus",  label: "Chorus"  },
          { type: "outro",   label: "Outro"   },
        ],
      },
    ],
  },
  {
    id: "metal",
    name: "Metal",
    description: "Heavy metal and hard rock structures",
    structures: [
      {
        id: "metal-a",
        name: "Classic Metal",
        description: "Heavy riff-driven song with a prominent guitar solo as the centrepiece. Standard enough for wide appeal but heavy enough to satisfy. Judas Priest, Iron Maiden, early Metallica territory.",
        sections: [
          { type: "intro",      label: "Intro"        },
          { type: "riff",       label: "Main Riff"    },
          { type: "verse",      label: "Verse 1"      },
          { type: "chorus",     label: "Chorus"       },
          { type: "verse",      label: "Verse 2"      },
          { type: "chorus",     label: "Chorus"       },
          { type: "solo",       label: "Guitar Solo"  },
          { type: "riff",       label: "Riff"         },
          { type: "chorus",     label: "Final Chorus" },
          { type: "outro",      label: "Outro"        },
        ],
      },
      {
        id: "metal-b",
        name: "Progressive Metal",
        description: "Non-linear and compositionally rich. Parts develop and return transformed — A becomes A prime. The interlude gives the listener breathing space before the solo launches. Tool, Opeth, Dream Theater.",
        sections: [
          { type: "intro",      label: "Intro"        },
          { type: "verse",      label: "Part A"       },
          { type: "bridge",     label: "Transition"   },
          { type: "chorus",     label: "Part B"       },
          { type: "interlude",  label: "Interlude"    },
          { type: "verse",      label: "Part A'"      },
          { type: "solo",       label: "Solo"         },
          { type: "chorus",     label: "Part B'"      },
          { type: "outro",      label: "Outro"        },
        ],
      },
      {
        id: "metal-c",
        name: "Thrash / Death",
        description: "Aggressive and relentless. Multiple riff variations keep the energy shifting while the breakdown provides a brutal low point before the solo tears loose. Slayer, Pantera, Cannibal Corpse.",
        sections: [
          { type: "intro",      label: "Intro"        },
          { type: "riff",       label: "Riff A"       },
          { type: "verse",      label: "Verse 1"      },
          { type: "riff",       label: "Riff B"       },
          { type: "verse",      label: "Verse 2"      },
          { type: "breakdown",  label: "Breakdown"    },
          { type: "solo",       label: "Solo"         },
          { type: "riff",       label: "Riff A'"      },
          { type: "outro",      label: "Outro"        },
        ],
      },
      {
        id: "metal-d",
        name: "Doom / Sludge",
        description: "Slow, heavy, and hypnotic. The sludge break is the emotional core — everything slows to a crawl before the riff reasserts itself. Long-form and immersive. Black Sabbath, Electric Wizard, Melvins.",
        sections: [
          { type: "intro",      label: "Drone Intro"  },
          { type: "riff",       label: "Main Riff"    },
          { type: "verse",      label: "Verse 1"      },
          { type: "riff",       label: "Riff"         },
          { type: "verse",      label: "Verse 2"      },
          { type: "breakdown",  label: "Sludge Break" },
          { type: "riff",       label: "Riff"         },
          { type: "outro",      label: "Fade Out"     },
        ],
      },
    ],
  },
  {
    id: "rnb",
    name: "R&B",
    description: "Contemporary and classic R&B song structures",
    structures: [
      {
        id: "rnb-a",
        name: "Classic R&B",
        description: "Smooth and vocal-driven. The pre-chorus creates longing before the chorus releases it. A bridge delivers intimacy or drama before the final chorus pays everything off. Think Beyoncé, Usher, Alicia Keys.",
        sections: [
          { type: "intro",      label: "Intro"      },
          { type: "verse",      label: "Verse 1"    },
          { type: "pre-chorus", label: "Pre-Chorus" },
          { type: "chorus",     label: "Chorus"     },
          { type: "verse",      label: "Verse 2"    },
          { type: "pre-chorus", label: "Pre-Chorus" },
          { type: "chorus",     label: "Chorus"     },
          { type: "bridge",     label: "Bridge"     },
          { type: "chorus",     label: "Chorus"     },
          { type: "outro",      label: "Outro"      },
        ],
      },
      {
        id: "rnb-b",
        name: "Contemporary R&B",
        description: "Modern and minimal with the chorus leading. Lean on the groove and the vocal performance rather than complex structure. SZA, Frank Ocean, H.E.R., Summer Walker feel.",
        sections: [
          { type: "chorus",     label: "Chorus"     },
          { type: "verse",      label: "Verse 1"    },
          { type: "chorus",     label: "Chorus"     },
          { type: "verse",      label: "Verse 2"    },
          { type: "bridge",     label: "Bridge"     },
          { type: "chorus",     label: "Chorus"     },
          { type: "outro",      label: "Outro"      },
        ],
      },
      {
        id: "rnb-c",
        name: "Neo Soul",
        description: "Laid-back and introspective. The interlude gives the track space to breathe — a moment of stillness before the outro carries the emotion home. Erykah Badu, D'Angelo, Lauryn Hill DNA.",
        sections: [
          { type: "intro",      label: "Intro"      },
          { type: "verse",      label: "Verse 1"    },
          { type: "chorus",     label: "Chorus"     },
          { type: "verse",      label: "Verse 2"    },
          { type: "chorus",     label: "Chorus"     },
          { type: "interlude",  label: "Interlude"  },
          { type: "verse",      label: "Verse 3"    },
          { type: "chorus",     label: "Chorus"     },
          { type: "outro",      label: "Outro"      },
        ],
      },
      {
        id: "rnb-d",
        name: "Slow Jam",
        description: "Intimate and unhurried. Repeated hook format keeps the mood locked in. The bridge is the emotional turn — the moment of vulnerability before the hook pulls you back in. Classic slow jam territory.",
        sections: [
          { type: "intro",      label: "Intro"      },
          { type: "verse",      label: "Verse 1"    },
          { type: "chorus",     label: "Hook"       },
          { type: "verse",      label: "Verse 2"    },
          { type: "chorus",     label: "Hook"       },
          { type: "bridge",     label: "Bridge"     },
          { type: "chorus",     label: "Hook"       },
          { type: "chorus",     label: "Hook Out"   },
        ],
      },
    ],
  },
]

// Contract types for the plugin interface
export interface SongStructureOutput {
  genreId: string
  genreName: string
  structureId: string
  structureName: string
  sections: SongSection[]
}

// Helper function to create output contract
export function createSongStructureOutput(genre: Genre, structure: SongStructure): SongStructureOutput {
  return {
    genreId: genre.id,
    genreName: genre.name,
    structureId: structure.id,
    structureName: structure.name,
    sections: structure.sections,
  }
}
