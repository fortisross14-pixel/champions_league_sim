// ── GUARANTEED QUALIFIERS (20 slots) ──────────────────────────
// 4 from Spain, Germany, Italy, England; 2 from Portugal, Netherlands, France; 1 from Russia, Scotland, Turkey, Greece

export const GUARANTEED = [
  // Spain (4) — no Barcelona
  { id:'rm',   name:'Real Madrid',       cc:'es', conf:'ESP', base:96, hist:200 },
  { id:'atm',  name:'Atlético Madrid',   cc:'es', conf:'ESP', base:88, hist:80  },
  { id:'sev',  name:'Sevilla',           cc:'es', conf:'ESP', base:82, hist:40  },
  { id:'rso',  name:'Real Sociedad',     cc:'es', conf:'ESP', base:79, hist:10  },

  // Germany (4)
  { id:'bay',  name:'Bayern Munich',     cc:'de', conf:'GER', base:95, hist:180 },
  { id:'bvb',  name:'Borussia Dortmund', cc:'de', conf:'GER', base:87, hist:60  },
  { id:'b04',  name:'Bayer Leverkusen',  cc:'de', conf:'GER', base:84, hist:20  },
  { id:'rbl',  name:'RB Leipzig',        cc:'de', conf:'GER', base:82, hist:15  },

  // Italy (4)
  { id:'juve', name:'Juventus',          cc:'it', conf:'ITA', base:88, hist:120 },
  { id:'acm',  name:'AC Milan',          cc:'it', conf:'ITA', base:87, hist:130 },
  { id:'int',  name:'Inter Milan',       cc:'it', conf:'ITA', base:88, hist:100 },
  { id:'nap',  name:'Napoli',            cc:'it', conf:'ITA', base:85, hist:30  },

  // England (4)
  { id:'mci',  name:'Manchester City',   cc:'gb-eng', conf:'ENG', base:94, hist:100 },
  { id:'liv',  name:'Liverpool',         cc:'gb-eng', conf:'ENG', base:91, hist:160 },
  { id:'ars',  name:'Arsenal',           cc:'gb-eng', conf:'ENG', base:88, hist:40  },
  { id:'che',  name:'Chelsea',           cc:'gb-eng', conf:'ENG', base:86, hist:80  },

  // Portugal (2)
  { id:'ben',  name:'Benfica',           cc:'pt', conf:'POR', base:83, hist:60  },
  { id:'por',  name:'FC Porto',          cc:'pt', conf:'POR', base:82, hist:70  },

  // Netherlands (2)
  { id:'ajx',  name:'Ajax',              cc:'nl', conf:'NED', base:82, hist:80  },
  { id:'psv',  name:'PSV Eindhoven',     cc:'nl', conf:'NED', base:80, hist:40  },

  // France (2)
  { id:'psg',  name:'Paris Saint-Germain', cc:'fr', conf:'FRA', base:91, hist:30 },
  { id:'oml',  name:'Olympique Lyon',    cc:'fr', conf:'FRA', base:80, hist:50  },

  // Russia (1)
  { id:'csm',  name:'CSKA Moscow',       cc:'ru', conf:'RUS', base:76, hist:20  },

  // Scotland (1)
  { id:'cel',  name:'Celtic',            cc:'gb-sct', conf:'SCO', base:76, hist:30 },

  // Turkey (1)
  { id:'gal',  name:'Galatasaray',       cc:'tr', conf:'TUR', base:77, hist:20  },

  // Greece (1)
  { id:'oly',  name:'Olympiakos',        cc:'gr', conf:'GRE', base:74, hist:15  },
]

// ── QUALIFYING POOL (12 extra spots from ~50 teams) ───────────
export const POOL = [
  { id:'bru',  name:'Club Brugge',       cc:'be', conf:'BEL', base:78, hist:15  },
  { id:'and',  name:'Anderlecht',        cc:'be', conf:'BEL', base:76, hist:20  },
  { id:'bsl',  name:'FC Basel',          cc:'ch', conf:'SUI', base:74, hist:10  },
  { id:'ybs',  name:'Young Boys',        cc:'ch', conf:'SUI', base:72, hist:5   },
  { id:'rbs',  name:'Red Bull Salzburg', cc:'at', conf:'AUT', base:76, hist:5   },
  { id:'stu',  name:'Sturm Graz',        cc:'at', conf:'AUT', base:70, hist:5   },
  { id:'fck',  name:'Fenerbahçe',        cc:'tr', conf:'TUR', base:75, hist:10  },
  { id:'bes',  name:'Beşiktaş',          cc:'tr', conf:'TUR', base:74, hist:10  },
  { id:'par',  name:'Panathinaikos',     cc:'gr', conf:'GRE', base:71, hist:10  },
  { id:'aek',  name:'AEK Athens',        cc:'gr', conf:'GRE', base:70, hist:8   },
  { id:'spa',  name:'Spartak Moscow',    cc:'ru', conf:'RUS', base:74, hist:15  },
  { id:'zen',  name:'Zenit',             cc:'ru', conf:'RUS', base:75, hist:10  },
  { id:'ran',  name:'Rangers',           cc:'gb-sct', conf:'SCO', base:73, hist:15 },
  { id:'hea',  name:'Heart of Midlothian',cc:'gb-sct', conf:'SCO', base:68, hist:5 },
  { id:'she',  name:'Shakhtar Donetsk',  cc:'ua', conf:'UKR', base:79, hist:20  },
  { id:'dyn',  name:'Dynamo Kyiv',       cc:'ua', conf:'UKR', base:76, hist:25  },
  { id:'rom',  name:'AS Roma',           cc:'it', conf:'ITA2', base:84, hist:30 },
  { id:'fio',  name:'Fiorentina',        cc:'it', conf:'ITA2', base:79, hist:15 },
  { id:'vil',  name:'Villarreal',        cc:'es', conf:'ESP2', base:81, hist:20 },
  { id:'ath',  name:'Athletic Bilbao',   cc:'es', conf:'ESP2', base:78, hist:10 },
  { id:'tot',  name:'Tottenham',         cc:'gb-eng', conf:'ENG2', base:83, hist:20 },
  { id:'mun',  name:'Manchester United', cc:'gb-eng', conf:'ENG2', base:84, hist:130 },
  { id:'mon',  name:'Monaco',            cc:'fr', conf:'FRA2', base:79, hist:30 },
  { id:'mso',  name:'Olympique Marseille',cc:'fr', conf:'FRA2', base:80, hist:40 },
  { id:'spo',  name:'Sporting CP',       cc:'pt', conf:'POR2', base:80, hist:30 },
  { id:'bra',  name:'SC Braga',          cc:'pt', conf:'POR2', base:74, hist:5  },
  { id:'fey',  name:'Feyenoord',         cc:'nl', conf:'NED2', base:79, hist:50 },
  { id:'ams',  name:'AZ Alkmaar',        cc:'nl', conf:'NED2', base:74, hist:5  },
  { id:'cfr',  name:'CFR Cluj',          cc:'ro', conf:'ROM', base:70, hist:5   },
  { id:'fcs',  name:'FCSB',              cc:'ro', conf:'ROM', base:68, hist:10  },
  { id:'slo',  name:'Slavia Prague',     cc:'cz', conf:'CZE', base:74, hist:10  },
  { id:'vkt',  name:'Viktoria Plzeň',    cc:'cz', conf:'CZE', base:71, hist:5   },
  { id:'lsk',  name:'Legia Warsaw',      cc:'pl', conf:'POL', base:70, hist:5   },
  { id:'rak',  name:'Raków',             cc:'pl', conf:'POL', base:68, hist:3   },
  { id:'mol',  name:'Molde',             cc:'no', conf:'NOR', base:68, hist:3   },
  { id:'bodo', name:'Bodø/Glimt',        cc:'no', conf:'NOR', base:72, hist:5   },
  { id:'mal',  name:'Malmö FF',          cc:'se', conf:'SWE', base:70, hist:8   },
  { id:'djg',  name:'Djurgårdens IF',    cc:'se', conf:'SWE', base:66, hist:3   },
  { id:'mid',  name:'Midtjylland',       cc:'dk', conf:'DEN', base:70, hist:5   },
  { id:'cop',  name:'FC Copenhagen',     cc:'dk', conf:'DEN', base:71, hist:8   },
  { id:'hib',  name:'Ferencváros',       cc:'hu', conf:'HUN', base:70, hist:8   },
  { id:'gen',  name:'Genk',              cc:'be', conf:'BEL2', base:73, hist:5  },
  { id:'din',  name:'Dinamo Zagreb',     cc:'hr', conf:'CRO', base:72, hist:10  },
  { id:'haj',  name:'Hajduk Split',      cc:'hr', conf:'CRO', base:68, hist:5   },
  { id:'lin',  name:'Lincoln Red Imps',  cc:'gi', conf:'GIB', base:58, hist:1   },
  { id:'slb',  name:'Sheriff Tiraspol',  cc:'md', conf:'MDA', base:64, hist:5   },
  { id:'kaa',  name:'KAA Gent',          cc:'be', conf:'BEL2', base:72, hist:5  },
  { id:'rib',  name:'Rigas FS',          cc:'lv', conf:'LAT', base:58, hist:1   },
  { id:'flo',  name:'Olimpija Ljubljana', cc:'si', conf:'SVN', base:62, hist:2  },
  { id:'lud',  name:'Ludogorets',        cc:'bg', conf:'BUL', base:67, hist:5   },
]

export const ALL_TEAMS = [...GUARANTEED, ...POOL]
