// ── Procedural player-name system ─────────────────────────────
// Major football languages use large combinatorial pools. Smaller
// football nations use compact country-specific pools. Country rules
// may mix first-name and surname cultures independently (Argentina,
// Switzerland, Canada, several African nations, etc.).

const SPANISH_FIRST = [
  'Adrián','Alejandro','Álex','Álvaro','Ander','Andrés','Ángel','Antonio','Aitor','Borja',
  'Bruno','Carlos','César','Dani','Daniel','David','Diego','Eduardo','Emilio','Enrique',
  'Fabián','Fernando','Francisco','Gabriel','Gonzalo','Héctor','Hugo','Iker','Iván','Javier',
  'Jesús','Joaquín','Jorge','José','Juan','Julián','Luis','Manuel','Marco','Marcos',
  'Mario','Martín','Mateo','Miguel','Nicolás','Óscar','Pablo','Pedro','Rafael','Raúl',
  'Ricardo','Rodrigo','Rubén','Samuel','Sergio','Thiago','Tomás','Víctor'
]
const SPANISH_LAST = [
  'Aguilar','Alonso','Álvarez','Arias','Benítez','Blanco','Bravo','Cabrera','Calderón','Campos',
  'Cano','Carmona','Carrasco','Castillo','Castro','Cortés','Cruz','Delgado','Díaz','Domínguez',
  'Durán','Escobar','Estévez','Fernández','Flores','Fuentes','Gallego','García','Garrido','Gil',
  'Giménez','Gómez','González','Guerrero','Gutiérrez','Hernández','Herrera','Iglesias','Jiménez','Lara',
  'León','López','Lozano','Marín','Márquez','Martínez','Medina','Méndez','Molina','Montero',
  'Montoya','Morales','Moreno','Muñoz','Navarro','Nieto','Núñez','Ortega','Ortiz','Pardo',
  'Pascual','Peña','Pérez','Prieto','Ramírez','Ramos','Reyes','Rivas','Rodríguez','Romero',
  'Ruiz','Sáez','Salazar','Sánchez','Santos','Serrano','Silva','Suárez','Torres','Valencia',
  'Vargas','Vázquez','Vega','Velasco','Vidal'
]

const ITALIAN_FIRST = [
  'Alessandro','Alessio','Andrea','Antonio','Carlo','Claudio','Daniele','Davide','Domenico','Edoardo',
  'Elia','Emanuele','Enrico','Fabio','Federico','Filippo','Francesco','Gabriele','Giacomo','Gianluca',
  'Giorgio','Giovanni','Giulio','Leonardo','Lorenzo','Luca','Luigi','Manuel','Marco','Matteo',
  'Mattia','Michele','Nicolò','Paolo','Pietro','Riccardo','Roberto','Salvatore','Sandro','Simone',
  'Stefano','Tommaso','Vincenzo'
]
const ITALIAN_LAST = [
  'Amato','Barbieri','Basile','Bellini','Benedetti','Bianchi','Bruno','Caputo','Caruso','Colombo',
  'Conti','Coppola','Costa','D’Angelo','De Luca','De Santis','Esposito','Fabbri','Farina','Ferrara',
  'Ferrari','Fontana','Galli','Gallo','Gentile','Giordano','Greco','Grassi','Leone','Lombardi',
  'Longo','Mancini','Marchetti','Marino','Martinelli','Martini','Mazza','Messina','Monti','Moretti',
  'Neri','Orlando','Pellegrini','Rinaldi','Ricci','Rizzo','Romano','Rossi','Russo','Sala',
  'Santoro','Sartori','Serra','Testa','Valentini','Villa','Vitale','Zanetti'
]

const ENGLISH_FIRST = [
  'Aaron','Adam','Alex','Alfie','Andrew','Ben','Billy','Callum','Cameron','Charlie',
  'Chris','Connor','Curtis','Daniel','Declan','Elliot','Ethan','Freddie','George','Harry',
  'Harvey','Jack','Jacob','James','Jamie','Jason','Jay','Joe','John','Jordan',
  'Josh','Jude','Kieran','Kyle','Lewis','Liam','Luke','Marcus','Mason','Matthew',
  'Nathan','Oliver','Ollie','Patrick','Paul','Reece','Ryan','Sam','Scott','Steven',
  'Theo','Thomas','Tom','Tyler','William'
]
const ENGLISH_LAST = [
  'Adams','Allen','Anderson','Armstrong','Bailey','Baker','Barnes','Bell','Bennett','Black',
  'Brown','Butler','Campbell','Carter','Clark','Clarke','Collins','Cook','Cooper','Davies',
  'Davis','Edwards','Evans','Fisher','Fletcher','Foster','Fraser','Gibson','Graham','Grant',
  'Gray','Green','Hall','Hamilton','Harris','Harrison','Henderson','Hill','Holden','Holmes',
  'Howard','Hughes','Hunter','Jackson','James','Johnson','Jones','Kelly','Kennedy','King',
  'Lee','Lewis','Martin','Mason','Miller','Mitchell','Moore','Morgan','Morris','Murphy',
  'Murray','Parker','Phillips','Price','Reid','Richards','Roberts','Robertson','Robinson','Ross',
  'Russell','Scott','Shaw','Smith','Stewart','Taylor','Thomas','Thompson','Walker','Ward',
  'Watson','White','Williams','Wilson','Wood','Wright','Young'
]

const GERMAN_FIRST = [
  'Alexander','André','Benjamin','Christian','Daniel','David','Dominik','Felix','Finn','Florian',
  'Frederik','Jan','Jonas','Jonathan','Joshua','Julian','Kai','Kevin','Leon','Leroy',
  'Lukas','Manuel','Marco','Mario','Markus','Martin','Matthias','Max','Maximilian','Moritz',
  'Niklas','Nico','Patrick','Philipp','Robin','Sebastian','Serge','Simon','Stefan','Sven',
  'Thomas','Tim','Timo','Tobias','Toni','Yannick'
]
const GERMAN_LAST = [
  'Arnold','Bauer','Baumann','Becker','Berger','Bergmann','Böhm','Brandt','Braun','Busch',
  'Dietrich','Engel','Fischer','Frank','Friedrich','Fuchs','Graf','Groß','Günther','Hahn',
  'Hartmann','Herrmann','Hoffmann','Huber','Jäger','Jung','Kaiser','Keller','Klein','Koch',
  'Köhler','König','Krause','Krüger','Lang','Lehmann','Lorenz','Maier','Mayer','Meier',
  'Meyer','Müller','Neumann','Otto','Peters','Pohl','Richter','Roth','Sauer','Schäfer',
  'Schmidt','Schneider','Scholz','Schreiber','Schröder','Schubert','Schulz','Schuster','Schwarz','Seidel',
  'Sommer','Stein','Vogel','Wagner','Walter','Weber','Weiß','Werner','Winkler','Wolf',
  'Zimmermann'
]

const FRENCH_FIRST = [
  'Adrien','Alexandre','Antoine','Aurélien','Baptiste','Benjamin','Benoît','Charles','Clément','Corentin',
  'Damien','Enzo','Étienne','Fabien','Florian','François','Gabriel','Gaël','Hugo','Jérémy',
  'Jonathan','Jules','Julien','Karim','Kingsley','Laurent','Léo','Lucas','Mathieu','Matthieu',
  'Maxime','Moussa','Nabil','Nicolas','Olivier','Ousmane','Paul','Pierre','Raphaël','Rémy',
  'Romain','Samuel','Sébastien','Théo','Thomas','Victor','William','Yann','Yohan','Zinedine'
]
const FRENCH_LAST = [
  'Adam','Andre','Barbier','Benoit','Bernard','Bertrand','Blanc','Bonnet','Boucher','Bourgeois',
  'Brun','Caron','Chevalier','Clément','Collet','Cousin','David','Denis','Deschamps','Dubois',
  'Dupont','Durand','Dumas','Faure','Fernandez','Fleury','Fontaine','Fournier','François','Garnier',
  'Gauthier','Gérard','Girard','Giraud','Gomez','Grondin','Guillaume','Henry','Hubert','Joly',
  'Lambert','Laurent','Leclerc','Lefebvre','Legrand','Lemaire','Lemoine','Leroy','Lopez','Marchand',
  'Martin','Martinez','Mercier','Meunier','Meyer','Michel','Moreau','Morin','Moulin','Nicolas',
  'Noël','Paris','Pasquier','Perrin','Petit','Philippe','Picard','Pierre','Renard','Rey',
  'Richard','Rivière','Robert','Robin','Roche','Rodriguez','Roussel','Rousseau','Roy','Simon',
  'Thomas','Vincent'
]

const PORTUGUESE_FIRST = [
  'Afonso','André','António','Bruno','Carlos','Danilo','Diogo','Duarte','Eduardo','Fábio',
  'Filipe','Francisco','Gonçalo','Guilherme','Hélder','Henrique','João','José','Leandro','Leonardo',
  'Luís','Manuel','Marco','Miguel','Nélson','Nuno','Paulo','Pedro','Rafael','Renato',
  'Ricardo','Rodrigo','Rúben','Rui','Salvador','Samuel','Sérgio','Tiago','Tomás','Vítor'
]
const PORTUGUESE_LAST = [
  'Almeida','Alves','Amaral','Andrade','Azevedo','Barbosa','Borges','Braga','Cardoso','Carvalho',
  'Castro','Coelho','Correia','Costa','Coutinho','Cruz','Dias','Domingues','Esteves','Fernandes',
  'Ferreira','Fonseca','Freitas','Gomes','Gonçalves','Lima','Lopes','Machado','Marques','Martins',
  'Matos','Melo','Mendes','Miranda','Monteiro','Moraes','Moreira','Mota','Neves','Nogueira',
  'Oliveira','Pacheco','Pereira','Pinto','Pires','Ramos','Reis','Ribeiro','Rocha','Rodrigues',
  'Santos','Silva','Simões','Soares','Sousa','Tavares','Teixeira','Vieira'
]

const ARABIC_FIRST = [
  'Abdel','Abdallah','Ahmed','Ali','Amine','Anas','Ayman','Bilal','Fahd','Fares',
  'Hakim','Hamza','Hassan','Hicham','Ibrahim','Idriss','Ismail','Jamal','Karim','Khaled',
  'Mahdi','Mahmoud','Marwan','Mehdi','Mohamed','Mounir','Mustafa','Nabil','Nasser','Omar',
  'Rachid','Rami','Rayan','Reda','Said','Samir','Sofiane','Tariq','Walid','Yassine',
  'Youssef','Zayd','Zineddine'
]
const ARABIC_LAST = [
  'Abbas','Abdallah','Abdelrahman','Ahmed','Akram','Alami','Amrani','Aouar','Ayoub','Bakkali',
  'Belaïli','Belhanda','Benali','Benatia','Bennasser','Benzema','Boufal','Bounou','Boutaib','Chafik',
  'Dahoud','Darwish','El Arabi','El Haddadi','El Khannouss','El Masry','Fathi','Ghazal','Haddad','Hakimi',
  'Hamid','Harit','Hassan','Hegazi','Ibrahim','Jaber','Kamal','Khalil','Mahrez','Mansour',
  'Matar','Meriem','Naji','Ounahi','Rahimi','Sabri','Saïss','Saleh','Slimani','Taarabt',
  'Touba','Yahia','Ziyech'
]

const DUTCH_FIRST = ['Bart','Bas','Bram','Daan','Daley','Davy','Dennis','Dirk','Donny','Erik','Frenkie','Jasper','Jeroen','Joey','Kenneth','Koen','Luuk','Maarten','Marten','Matthijs','Memphis','Noa','Pieter','Robin','Ruud','Sander','Sven','Teun','Thijs','Wout']
const DUTCH_LAST = ['Bakker','Bos','Brouwer','Dekker','De Boer','De Groot','De Jong','De Vries','Dijkstra','Hendriks','Hoekstra','Jansen','Kok','Maas','Meijer','Mulder','Peters','Prins','Smit','Van Beek','Van den Berg','Van Dijk','Van Leeuwen','Van der Meer','Verhoeven','Visser','Vos']
const NORDIC_FIRST = ['Anders','Axel','Bjørn','Christian','Emil','Erik','Fredrik','Gustav','Henrik','Isak','Jonas','Kasper','Lars','Magnus','Mikael','Mikkel','Nils','Oskar','Rasmus','Sander','Søren','Viktor']
const NORDIC_LAST = ['Andersen','Andersson','Berg','Dahl','Eriksen','Hansen','Johansen','Johansson','Jørgensen','Karlsson','Kristensen','Larsen','Larsson','Lindberg','Lund','Nielsen','Nilsson','Olsen','Pedersen','Svensson','Sørensen']
const SLAVIC_FIRST = ['Aleksandar','Andrej','Bojan','Damir','Darko','Dejan','Filip','Ivan','Jakub','Jan','Luka','Marko','Martin','Matej','Milan','Miloš','Nikola','Pavel','Petar','Stefan','Tomas','Viktor']
const SLAVIC_LAST = ['Babić','Horvat','Ilić','Janković','Kovač','Kovačević','Kowalski','Marković','Matić','Nikolić','Novak','Nowak','Pavlović','Petrović','Popović','Radić','Stanković','Tomić','Vuković','Zieliński']
const RUSSIAN_FIRST = ['Aleksey','Aleksandr','Andrey','Anton','Artem','Denis','Dmitry','Igor','Ilya','Ivan','Konstantin','Maksim','Mikhail','Nikita','Oleg','Pavel','Roman','Sergey','Stanislav','Vladimir','Yuri']
const RUSSIAN_LAST = ['Bogdanov','Fedorov','Golubev','Ivanov','Kozlov','Kuznetsov','Lebedev','Morozov','Novikov','Orlov','Pavlov','Petrov','Popov','Semenov','Smirnov','Sokolov','Solovyov','Vasilyev','Vinogradov','Volkov','Vorobyev','Zaytsev']
const TURKISH_FIRST = ['Ahmet','Arda','Berk','Burak','Can','Cengiz','Emre','Enes','Hakan','Halil','İrfan','Kerem','Mehmet','Mert','Oğuz','Okan','Orkun','Salih','Selçuk','Umut','Yusuf']
const TURKISH_LAST = ['Akgün','Aksoy','Arslan','Aydın','Ayhan','Bayram','Çelik','Demir','Doğan','Güneş','Kaya','Kılıç','Kurt','Özdemir','Öztürk','Şahin','Şen','Tosun','Tufan','Yıldırım','Yılmaz']
const GREEK_FIRST = ['Andreas','Anastasios','Christos','Dimitris','Giorgos','Giannis','Kostas','Konstantinos','Manolis','Michalis','Nikolaos','Petros','Sokratis','Spyros','Stefanos','Tasos','Thanasis','Vangelis','Vasilis']
const GREEK_LAST = ['Bakasetas','Fortounis','Galanopoulos','Hatzidis','Karelis','Konstantinidis','Kyriakopoulos','Mantalos','Masouras','Mavropanos','Nikolaou','Papadopoulos','Pappas','Pavlidis','Stafylidis','Tsimikas','Tzolis','Vlachodimos','Zafeiris']
const NIGERIAN_FIRST = ['Ademola','Alex','Bright','Calvin','Chidera','Chidozie','Emmanuel','Frank','Henry','Innocent','Joe','Kelechi','Kenneth','Maduka','Moses','Samuel','Taiwo','Victor','Wilfred','William']
const NIGERIAN_LAST = ['Aina','Ajayi','Akpom','Aribo','Awaziem','Awoniyi','Bassey','Chukwueze','Dennis','Ebuehi','Iheanacho','Ighalo','Iwobi','Lookman','Ndidi','Nwabali','Okafor','Okoye','Onuachu','Onyeka','Osimhen','Simon','Troost-Ekong']
const WEST_AFRICAN_FIRST = ['Abdou','Adama','Amadou','Bamba','Cheick','Demba','Famara','Habib','Idrissa','Iñaki','Ismaïla','Kalidou','Koffi','Lamine','Mamadou','Mohamed','Moussa','Ousmane','Pape','Sadio','Salif','Sékou']
const WEST_AFRICAN_LAST = ['Ba','Camara','Cissé','Coulibaly','Diallo','Diatta','Diomande','Diop','Fofana','Gassama','Gueye','Kamara','Kanté','Konaté','Kouassi','Koulibaly','Mané','Mendy','Ndiaye','Sangaré','Sarr','Touré','Traoré']
const JAPANESE_FIRST = ['Ao','Daichi','Haruto','Hiroki','Jun','Kaoru','Keisuke','Kento','Ko','Koki','Makoto','Minato','Riku','Ritsu','Ryota','Shinji','Shota','Sota','Takefusa','Takumi','Yuki','Yuma']
const JAPANESE_LAST = ['Abe','Endo','Fujimoto','Hayashi','Honda','Ito','Kamada','Kato','Kawasaki','Kobayashi','Maeda','Matsuda','Matsumoto','Minamino','Mito','Mori','Nakamura','Saito','Sato','Suzuki','Tanaka','Watanabe','Yamada','Yamamoto']
const KOREAN_FIRST = ['Chang-hoon','Dong-hyun','Eui-jo','Hee-chan','Heung-min','Hyun-jun','In-beom','Jae-sung','Ji-sung','Jin-su','Kang-in','Min-jae','Min-woo','Sang-ho','Seung-ho','Tae-hee','Woo-young','Young-gwon']
const KOREAN_LAST = ['Bae','Cho','Choi','Han','Hong','Hwang','Jeon','Jung','Kang','Kim','Kwon','Lee','Lim','Moon','Oh','Park','Seo','Shin','Son','Yoon']
const BRAZIL_FIRST = ['Adriano','Alex','Anderson','André','Antônio','Bruno','Caio','Carlos','Danilo','Diego','Douglas','Eduardo','Everton','Fábio','Felipe','Gabriel','Guilherme','João','Lucas','Luiz','Marcelo','Marcos','Matheus','Paulo','Rafael','Renato','Ricardo','Rodrigo','Thiago','Vinícius']
const IRISH_FIRST = ['Aidan','Cian','Conor','Darragh','Declan','Eoin','Finn','Jack','Jamie','Liam','Niall','Oisín','Patrick','Ronan','Seán']
const IRISH_LAST = ['Brennan','Byrne','Clarke','Collins','Doherty','Doyle','Duffy','Kelly','Kennedy','Lynch','McCarthy','McGrath','Murphy','O’Brien','O’Connor','Quinn','Reid']

export const NAME_DB = {
  spanish:{ first:SPANISH_FIRST, last:SPANISH_LAST },
  italian:{ first:ITALIAN_FIRST, last:ITALIAN_LAST },
  english:{ first:ENGLISH_FIRST, last:ENGLISH_LAST },
  german:{ first:GERMAN_FIRST, last:GERMAN_LAST },
  french:{ first:FRENCH_FIRST, last:FRENCH_LAST },
  portuguese:{ first:PORTUGUESE_FIRST, last:PORTUGUESE_LAST },
  arabic:{ first:ARABIC_FIRST, last:ARABIC_LAST },
  dutch:{ first:DUTCH_FIRST, last:DUTCH_LAST },
  nordic:{ first:NORDIC_FIRST, last:NORDIC_LAST },
  slavic:{ first:SLAVIC_FIRST, last:SLAVIC_LAST },
  russian:{ first:RUSSIAN_FIRST, last:RUSSIAN_LAST },
  turkish:{ first:TURKISH_FIRST, last:TURKISH_LAST },
  greek:{ first:GREEK_FIRST, last:GREEK_LAST },
  nigerian:{ first:NIGERIAN_FIRST, last:NIGERIAN_LAST },
  westAfrican:{ first:WEST_AFRICAN_FIRST, last:WEST_AFRICAN_LAST },
  japanese:{ first:JAPANESE_FIRST, last:JAPANESE_LAST },
  korean:{ first:KOREAN_FIRST, last:KOREAN_LAST },
  brazil:{ first:BRAZIL_FIRST, last:PORTUGUESE_LAST },
  irish:{ first:IRISH_FIRST, last:IRISH_LAST },
}

const RULES = {
  es:{ first:[['spanish',1]], last:[['spanish',1]] },
  ar:{ first:[['spanish',1]], last:[['spanish',0.5],['italian',0.5]] },
  uy:{ first:[['spanish',1]], last:[['spanish',0.65],['italian',0.35]] },
  mx:{ first:[['spanish',1]], last:[['spanish',1]] }, co:{ first:[['spanish',1]], last:[['spanish',1]] },
  cl:{ first:[['spanish',1]], last:[['spanish',1]] }, pe:{ first:[['spanish',1]], last:[['spanish',1]] },
  ec:{ first:[['spanish',1]], last:[['spanish',1]] }, py:{ first:[['spanish',1]], last:[['spanish',1]] },
  ve:{ first:[['spanish',1]], last:[['spanish',1]] }, cr:{ first:[['spanish',1]], last:[['spanish',1]] },

  it:{ first:[['italian',1]], last:[['italian',1]] },
  'gb-eng':{ first:[['english',1]], last:[['english',1]] },
  'gb-sct':{ first:[['english',0.75],['irish',0.25]], last:[['english',0.75],['irish',0.25]] },
  'gb-wls':{ first:[['english',1]], last:[['english',1]] }, ie:{ first:[['irish',0.7],['english',0.3]], last:[['irish',0.8],['english',0.2]] },
  us:{ first:[['english',0.75],['spanish',0.15],['french',0.1]], last:[['english',0.7],['spanish',0.15],['italian',0.1],['french',0.05]] },
  ca:{ first:[['english',0.5],['french',0.5]], last:[['english',0.5],['french',0.5]] }, au:{ first:[['english',1]], last:[['english',1]] },

  de:{ first:[['german',1]], last:[['german',1]] }, at:{ first:[['german',1]], last:[['german',1]] },
  ch:{ first:[['german',0.55],['french',0.3],['italian',0.15]], last:[['german',0.55],['french',0.3],['italian',0.15]] },
  fr:{ first:[['french',1]], last:[['french',1]] }, be:{ first:[['french',0.55],['dutch',0.45]], last:[['french',0.55],['dutch',0.45]] },
  ci:{ first:[['french',0.55],['westAfrican',0.45]], last:[['westAfrican',0.65],['french',0.35]] },
  cm:{ first:[['french',0.55],['westAfrican',0.45]], last:[['westAfrican',0.65],['french',0.35]] },
  sn:{ first:[['westAfrican',0.65],['french',0.35]], last:[['westAfrican',0.8],['french',0.2]] },
  ml:{ first:[['westAfrican',0.65],['french',0.35]], last:[['westAfrican',0.8],['french',0.2]] },

  pt:{ first:[['portuguese',1]], last:[['portuguese',1]] }, br:{ first:[['brazil',1]], last:[['portuguese',1]] },
  ao:{ first:[['portuguese',0.55],['westAfrican',0.45]], last:[['portuguese',0.7],['westAfrican',0.3]] },
  cv:{ first:[['portuguese',0.7],['westAfrican',0.3]], last:[['portuguese',0.8],['westAfrican',0.2]] },
  mz:{ first:[['portuguese',0.55],['westAfrican',0.45]], last:[['portuguese',0.7],['westAfrican',0.3]] },

  ma:{ first:[['arabic',1]], last:[['arabic',1]] }, dz:{ first:[['arabic',1]], last:[['arabic',1]] },
  tn:{ first:[['arabic',1]], last:[['arabic',1]] }, eg:{ first:[['arabic',1]], last:[['arabic',1]] },
  sa:{ first:[['arabic',1]], last:[['arabic',1]] }, qa:{ first:[['arabic',1]], last:[['arabic',1]] },

  nl:{ first:[['dutch',1]], last:[['dutch',1]] },
  no:{ first:[['nordic',1]], last:[['nordic',1]] }, se:{ first:[['nordic',1]], last:[['nordic',1]] }, dk:{ first:[['nordic',1]], last:[['nordic',1]] },
  pl:{ first:[['slavic',1]], last:[['slavic',1]] }, cz:{ first:[['slavic',1]], last:[['slavic',1]] },
  hr:{ first:[['slavic',1]], last:[['slavic',1]] }, rs:{ first:[['slavic',1]], last:[['slavic',1]] },
  ba:{ first:[['slavic',1]], last:[['slavic',1]] }, si:{ first:[['slavic',1]], last:[['slavic',1]] },
  bg:{ first:[['slavic',1]], last:[['slavic',1]] }, ro:{ first:[['slavic',0.7],['italian',0.3]], last:[['slavic',1]] },
  hu:{ first:[['slavic',0.65],['german',0.35]], last:[['slavic',1]] },
  ru:{ first:[['russian',1]], last:[['russian',1]] }, ua:{ first:[['slavic',0.65],['russian',0.35]], last:[['slavic',0.65],['russian',0.35]] },
  tr:{ first:[['turkish',1]], last:[['turkish',1]] }, gr:{ first:[['greek',1]], last:[['greek',1]] },
  ng:{ first:[['nigerian',1]], last:[['nigerian',1]] }, gh:{ first:[['english',0.45],['westAfrican',0.55]], last:[['westAfrican',0.8],['english',0.2]] },
  za:{ first:[['english',0.55],['westAfrican',0.25],['dutch',0.2]], last:[['english',0.45],['westAfrican',0.3],['dutch',0.25]] },
  jp:{ first:[['japanese',1]], last:[['japanese',1]] }, kr:{ first:[['korean',1]], last:[['korean',1]] },
  md:{ first:[['slavic',0.7],['russian',0.3]], last:[['slavic',0.7],['russian',0.3]] }, lv:{ first:[['nordic',0.5],['slavic',0.5]], last:[['nordic',0.5],['slavic',0.5]] },
  gi:{ first:[['english',0.55],['spanish',0.45]], last:[['english',0.45],['spanish',0.55]] },
  eu:{ first:[['slavic',0.25],['german',0.2],['english',0.2],['french',0.15],['nordic',0.1],['italian',0.1]], last:[['slavic',0.25],['german',0.2],['english',0.2],['french',0.15],['nordic',0.1],['italian',0.1]] },
}

export const COUNTRY_NAME = {
  es:'Spain', de:'Germany', it:'Italy', 'gb-eng':'England', 'gb-sct':'Scotland', 'gb-wls':'Wales', ie:'Ireland',
  fr:'France', pt:'Portugal', nl:'Netherlands', ru:'Russia', tr:'Turkey', gr:'Greece', ua:'Ukraine',
  br:'Brazil', ar:'Argentina', uy:'Uruguay', mx:'Mexico', co:'Colombia', cl:'Chile', pe:'Peru', ec:'Ecuador',
  py:'Paraguay', ve:'Venezuela', cr:'Costa Rica', us:'United States', ca:'Canada', au:'Australia',
  ma:'Morocco', dz:'Algeria', tn:'Tunisia', eg:'Egypt', sa:'Saudi Arabia', qa:'Qatar',
  sn:'Senegal', ng:'Nigeria', gh:'Ghana', ci:'Ivory Coast', cm:'Cameroon', ml:'Mali', za:'South Africa',
  ao:'Angola', cv:'Cape Verde', mz:'Mozambique', jp:'Japan', kr:'South Korea',
  be:'Belgium', ch:'Switzerland', at:'Austria', ro:'Romania', cz:'Czechia', pl:'Poland', no:'Norway',
  se:'Sweden', dk:'Denmark', hr:'Croatia', rs:'Serbia', ba:'Bosnia and Herzegovina', hu:'Hungary',
  bg:'Bulgaria', md:'Moldova', lv:'Latvia', si:'Slovenia', gi:'Gibraltar', eu:'Europe'
}

const FOREIGN_NATIONALITIES = [
  {cc:'br',weight:18},{cc:'ar',weight:13},{cc:'uy',weight:6},{cc:'co',weight:6},{cc:'mx',weight:4},{cc:'cl',weight:3},{cc:'ec',weight:2},{cc:'py',weight:2},
  {cc:'pt',weight:4},{cc:'fr',weight:4},{cc:'de',weight:3},{cc:'it',weight:4},{cc:'nl',weight:3},{cc:'be',weight:2},{cc:'hr',weight:2},{cc:'rs',weight:2},
  {cc:'sn',weight:4},{cc:'ng',weight:5},{cc:'gh',weight:3},{cc:'ci',weight:3},{cc:'cm',weight:3},{cc:'ml',weight:2},{cc:'ma',weight:4},{cc:'dz',weight:3},{cc:'tn',weight:2},{cc:'eg',weight:2},
  {cc:'ao',weight:2},{cc:'cv',weight:2},{cc:'mz',weight:1},{cc:'jp',weight:3},{cc:'kr',weight:3},{cc:'us',weight:3},{cc:'ca',weight:2},{cc:'ie',weight:2},{cc:'au',weight:1},{cc:'za',weight:2},
]

function weightedPick(entries) {
  const total = entries.reduce((sum, entry) => sum + entry[1], 0)
  let roll = Math.random() * total
  for (const entry of entries) {
    roll -= entry[1]
    if (roll <= 0) return entry[0]
  }
  return entries[entries.length - 1][0]
}
function pickFrom(pool) { return pool[Math.floor(Math.random() * pool.length)] }
function choosePool(ruleSide) {
  const key = weightedPick(ruleSide)
  return NAME_DB[key] || NAME_DB.english
}

export function pickForeignNationality() {
  const total = FOREIGN_NATIONALITIES.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = Math.random() * total
  for (const entry of FOREIGN_NATIONALITIES) {
    roll -= entry.weight
    if (roll <= 0) return entry.cc
  }
  return FOREIGN_NATIONALITIES[0].cc
}

// Most academy players retain the club country's nationality; the rest
// come from a broad, football-realistic international pool.
export function pickPlayerNationality(teamCC) {
  if (Math.random() < 0.60) return teamCC
  return pickForeignNationality()
}

export function genNameForCC(cc) {
  const rule = RULES[cc] || RULES.eu
  const firstPool = choosePool(rule.first)
  const lastPool = choosePool(rule.last)
  return `${pickFrom(firstPool.first)} ${pickFrom(lastPool.last)}`
}

export function genCoachName(cc) {
  return genNameForCC(RULES[cc] ? cc : 'eu')
}
