// ── League configuration ─────────────────────────────────────
// Each league has a country code, display name, and number of slots
// in the European tournament. The first slot is always the local
// league champion for that season.
export const LEAGUES = [
  { id:'ESP', cc:'es',     name:'Spain',          slots:4 },
  { id:'GER', cc:'de',     name:'Germany',        slots:4 },
  { id:'ITA', cc:'it',     name:'Italy',          slots:4 },
  { id:'ENG', cc:'gb-eng', name:'England',        slots:4 },
  { id:'FRA', cc:'fr',     name:'France',         slots:2 },
  { id:'POR', cc:'pt',     name:'Portugal',       slots:2 },
  { id:'NED', cc:'nl',     name:'Netherlands',    slots:2 },
  { id:'TUR', cc:'tr',     name:'Turkey',         slots:1 },
  { id:'SCO', cc:'gb-sct', name:'Scotland',       slots:1 },
  { id:'RUS', cc:'ru',     name:'Russia',         slots:1 },
  { id:'UKR', cc:'ua',     name:'Ukraine',        slots:1 },
  { id:'GRE', cc:'gr',     name:'Greece',         slots:1 },
  { id:'ROE', cc:'eu',     name:'Rest of Europe', slots:5 },
]

// ── Big-league team pools ─────────────────────────────────────
// Each entry: { id, name, cc, league, base, hist }
// `league` matches the LEAGUES.id. Each team competes in its national
// league at the start of the season; we sort that league locally and
// take `slots` teams (champion + runners-up) for the Champions League.
//
// We keep at least `slots + 2` teams per main league so the local
// "league standings" feel real.

export const SPAIN = [
  { id:'rm',   name:'Real Madrid',     league:'ESP', cc:'es', base:98, hist:200 },
  { id:'atm',  name:'Atlético Madrid', league:'ESP', cc:'es', base:88, hist:80  },
  { id:'sev',  name:'Sevilla',         league:'ESP', cc:'es', base:82, hist:40  },
  { id:'rso',  name:'Real Sociedad',   league:'ESP', cc:'es', base:79, hist:10  },
  { id:'vil',  name:'Villarreal',      league:'ESP', cc:'es', base:81, hist:20  },
  { id:'ath',  name:'Athletic Bilbao', league:'ESP', cc:'es', base:78, hist:10  },
  { id:'bet',  name:'Real Betis',      league:'ESP', cc:'es', base:76, hist:8   },
  { id:'val',  name:'Valencia',        league:'ESP', cc:'es', base:77, hist:25  },
]

export const GERMANY = [
  { id:'bay',  name:'Bayern Munich',     league:'GER', cc:'de', base:95, hist:180 },
  { id:'bvb',  name:'Borussia Dortmund', league:'GER', cc:'de', base:87, hist:60  },
  { id:'b04',  name:'Bayer Leverkusen',  league:'GER', cc:'de', base:84, hist:20  },
  { id:'rbl',  name:'RB Leipzig',        league:'GER', cc:'de', base:82, hist:15  },
  { id:'sge',  name:'Eintracht Frankfurt',league:'GER', cc:'de', base:78, hist:10 },
  { id:'wol',  name:'VfL Wolfsburg',     league:'GER', cc:'de', base:76, hist:10  },
  { id:'sck',  name:'Schalke 04',        league:'GER', cc:'de', base:74, hist:25  },
  { id:'svw',  name:'Werder Bremen',     league:'GER', cc:'de', base:73, hist:15  },
]

export const ITALY = [
  { id:'juve', name:'Juventus',     league:'ITA', cc:'it', base:88, hist:120 },
  { id:'acm',  name:'AC Milan',     league:'ITA', cc:'it', base:95, hist:130 },
  { id:'int',  name:'Inter Milan',  league:'ITA', cc:'it', base:88, hist:100 },
  { id:'nap',  name:'Napoli',       league:'ITA', cc:'it', base:85, hist:30  },
  { id:'rom',  name:'AS Roma',      league:'ITA', cc:'it', base:84, hist:30  },
  { id:'fio',  name:'Fiorentina',   league:'ITA', cc:'it', base:79, hist:15  },
  { id:'laz',  name:'Lazio',        league:'ITA', cc:'it', base:80, hist:20  },
  { id:'ata',  name:'Atalanta',     league:'ITA', cc:'it', base:81, hist:10  },
]

export const ENGLAND = [
  { id:'mci',  name:'Manchester City',   league:'ENG', cc:'gb-eng', base:94, hist:100 },
  { id:'liv',  name:'Liverpool',         league:'ENG', cc:'gb-eng', base:95, hist:160 },
  { id:'ars',  name:'Arsenal',           league:'ENG', cc:'gb-eng', base:88, hist:40  },
  { id:'che',  name:'Chelsea',           league:'ENG', cc:'gb-eng', base:86, hist:80  },
  { id:'tot',  name:'Tottenham',         league:'ENG', cc:'gb-eng', base:83, hist:20  },
  { id:'mun',  name:'Manchester United', league:'ENG', cc:'gb-eng', base:84, hist:130 },
  { id:'new',  name:'Newcastle',         league:'ENG', cc:'gb-eng', base:80, hist:10  },
  { id:'avl',  name:'Aston Villa',       league:'ENG', cc:'gb-eng', base:79, hist:15  },
]

export const FRANCE = [
  { id:'psg',  name:'Paris Saint-Germain',league:'FRA', cc:'fr', base:91, hist:30 },
  { id:'oml',  name:'Olympique Lyon',    league:'FRA', cc:'fr', base:80, hist:50  },
  { id:'mso',  name:'Olympique Marseille',league:'FRA', cc:'fr', base:80, hist:40 },
  { id:'mon',  name:'Monaco',            league:'FRA', cc:'fr', base:79, hist:30  },
]

export const PORTUGAL = [
  { id:'ben',  name:'Benfica',     league:'POR', cc:'pt', base:83, hist:60 },
  { id:'por',  name:'FC Porto',    league:'POR', cc:'pt', base:82, hist:70 },
  { id:'spo',  name:'Sporting CP', league:'POR', cc:'pt', base:80, hist:30 },
  { id:'bra',  name:'SC Braga',    league:'POR', cc:'pt', base:74, hist:5  },
]

export const NETHERLANDS = [
  { id:'ajx',  name:'Ajax',           league:'NED', cc:'nl', base:82, hist:80 },
  { id:'psv',  name:'PSV Eindhoven',  league:'NED', cc:'nl', base:80, hist:40 },
  { id:'fey',  name:'Feyenoord',      league:'NED', cc:'nl', base:79, hist:50 },
  { id:'ams',  name:'AZ Alkmaar',     league:'NED', cc:'nl', base:74, hist:5  },
]

export const TURKEY = [
  { id:'gal',  name:'Galatasaray', league:'TUR', cc:'tr', base:77, hist:20 },
  { id:'fck',  name:'Fenerbahçe',  league:'TUR', cc:'tr', base:75, hist:10 },
  { id:'bes',  name:'Beşiktaş',    league:'TUR', cc:'tr', base:74, hist:10 },
]

export const SCOTLAND = [
  { id:'cel',  name:'Celtic',              league:'SCO', cc:'gb-sct', base:76, hist:30 },
  { id:'ran',  name:'Rangers',             league:'SCO', cc:'gb-sct', base:73, hist:15 },
  { id:'hea',  name:'Heart of Midlothian', league:'SCO', cc:'gb-sct', base:68, hist:5  },
]

export const RUSSIA = [
  { id:'csm',  name:'CSKA Moscow',    league:'RUS', cc:'ru', base:76, hist:20 },
  { id:'spa',  name:'Spartak Moscow', league:'RUS', cc:'ru', base:74, hist:15 },
  { id:'zen',  name:'Zenit',          league:'RUS', cc:'ru', base:75, hist:10 },
]

export const UKRAINE = [
  { id:'she',  name:'Shakhtar Donetsk', league:'UKR', cc:'ua', base:79, hist:20 },
  { id:'dyn',  name:'Dynamo Kyiv',      league:'UKR', cc:'ua', base:76, hist:25 },
]

export const GREECE = [
  { id:'oly',  name:'Olympiakos',     league:'GRE', cc:'gr', base:74, hist:15 },
  { id:'par',  name:'Panathinaikos',  league:'GRE', cc:'gr', base:71, hist:10 },
  { id:'aek',  name:'AEK Athens',     league:'GRE', cc:'gr', base:70, hist:8  },
]

// Rest of Europe — these clubs all compete for 5 spots in a single
// pseudo-league. The top finisher is the "Rest of Europe champion".
export const REST_OF_EUROPE = [
  { id:'bru',  name:'Club Brugge',         league:'ROE', cc:'be', base:78, hist:15 },
  { id:'and',  name:'Anderlecht',          league:'ROE', cc:'be', base:76, hist:20 },
  { id:'gen',  name:'Genk',                league:'ROE', cc:'be', base:73, hist:5  },
  { id:'kaa',  name:'KAA Gent',            league:'ROE', cc:'be', base:72, hist:5  },
  { id:'bsl',  name:'FC Basel',            league:'ROE', cc:'ch', base:74, hist:10 },
  { id:'ybs',  name:'Young Boys',          league:'ROE', cc:'ch', base:72, hist:5  },
  { id:'rbs',  name:'Red Bull Salzburg',   league:'ROE', cc:'at', base:76, hist:5  },
  { id:'stu',  name:'Sturm Graz',          league:'ROE', cc:'at', base:70, hist:5  },
  { id:'cfr',  name:'CFR Cluj',            league:'ROE', cc:'ro', base:70, hist:5  },
  { id:'fcs',  name:'FCSB',                league:'ROE', cc:'ro', base:68, hist:10 },
  { id:'slo',  name:'Slavia Prague',       league:'ROE', cc:'cz', base:74, hist:10 },
  { id:'vkt',  name:'Viktoria Plzeň',      league:'ROE', cc:'cz', base:71, hist:5  },
  { id:'lsk',  name:'Legia Warsaw',        league:'ROE', cc:'pl', base:70, hist:5  },
  { id:'rak',  name:'Raków',               league:'ROE', cc:'pl', base:68, hist:3  },
  { id:'mol',  name:'Molde',               league:'ROE', cc:'no', base:68, hist:3  },
  { id:'bodo', name:'Bodø/Glimt',          league:'ROE', cc:'no', base:72, hist:5  },
  { id:'mal',  name:'Malmö FF',            league:'ROE', cc:'se', base:70, hist:8  },
  { id:'mid',  name:'Midtjylland',         league:'ROE', cc:'dk', base:70, hist:5  },
  { id:'cop',  name:'FC Copenhagen',       league:'ROE', cc:'dk', base:71, hist:8  },
  { id:'din',  name:'Dinamo Zagreb',       league:'ROE', cc:'hr', base:72, hist:10 },
  { id:'haj',  name:'Hajduk Split',        league:'ROE', cc:'hr', base:68, hist:5  },
  { id:'fer',  name:'Ferencváros',         league:'ROE', cc:'hu', base:70, hist:8  },
  { id:'lud',  name:'Ludogorets',          league:'ROE', cc:'bg', base:67, hist:5  },
]

// Group all teams by league so engine can run local league sims.
export const LEAGUE_TEAMS = {
  ESP: SPAIN, GER: GERMANY, ITA: ITALY, ENG: ENGLAND,
  FRA: FRANCE, POR: PORTUGAL, NED: NETHERLANDS,
  TUR: TURKEY, SCO: SCOTLAND, RUS: RUSSIA, UKR: UKRAINE, GRE: GREECE,
  ROE: REST_OF_EUROPE,
}

export const ALL_TEAMS = [
  ...SPAIN, ...GERMANY, ...ITALY, ...ENGLAND, ...FRANCE, ...PORTUGAL,
  ...NETHERLANDS, ...TURKEY, ...SCOTLAND, ...RUSSIA, ...UKRAINE, ...GREECE,
  ...REST_OF_EUROPE
]
