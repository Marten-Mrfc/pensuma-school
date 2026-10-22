/**
 * About 1000 common English and Dutch passwords and base words, lower-
 * cased. Used by password-policy.ts (also after stripping digits and
 * symbols, so "Welkom01!" matches "welkom"). Pure data module.
 */

const LIST = `
123456 123456789 12345678 password qwerty123 qwerty1 111111 12345 secret
123123 1234567890 1234567 000000 qwerty abc123 password1 iloveyou 1q2w3e4r
1q2w3e4r5t 1q2w3e4r5t6y qwertyuiop 654321 555555 lovely 7777777 888888
princess dragon 123qwe sunshine 666666 football monkey 121212 superman
welcome welcome1 admin admin123 administrator letmein login master hello
freedom whatever qazwsx trustno1 zaq12wsx zaq1zaq1 passw0rd p@ssw0rd
p@ssword passwort baseball shadow michael mustang jennifer jordan hunter
ranger buster soccer harley batman andrew tigger charlie robert thomas
hockey daniel starwars klaster george computer michelle jessica pepper
zxcvbnm zxcvbn asdfgh asdfghjkl asdf1234 qwer1234 1qaz2wsx 1qazxsw2 qwe123
q1w2e3r4 q1w2e3r4t5 a1b2c3 aa123456 abc12345 abcd1234 abcdef abcdefg
abcdefgh abcdefghi abcdefghij 987654321 9876543210 11111111 1111111111
22222222 00000000 99999999 123321 112233 121314 159753 147258369 147258
159357 753951 789456 789456123 456789 123654 2580 1212 696969 zxcv1234
password12 password123 password1234 passwordpassword pass pass123 pass1234
test test123 test1234 testing guest default changeme changeme123 secret123
temp temp123 temporary user user123 root toor demo demo123 sample access
access14 killer jordan23 tigers summer winter spring autumn flower flowers
cookie cheese butter coffee banana orange apple chocolate love lover loveme
iloveu iloveyou1 iloveyou2 babygirl baby angel angels beautiful blessed god
jesus jesus1 christ heaven sweet sweetie honey sugar candy kitty kitten
puppy doggie tiger lion eagle falcon phoenix dragon1 dragons wizard magic
merlin gandalf matrix neo hacker hackme internet google facebook twitter
instagram youtube netflix spotify minecraft fortnite roblox pokemon pikachu
naruto goku mario zelda nintendo playstation xbox gamer gaming player
player1 games soccer1 football1 basketball baseball1 hockey1 tennis golf
golfer liverpool chelsea arsenal manchester barcelona realmadrid juventus
messi ronaldo maradona yankees lakers cowboys steelers eagles packers
raiders broncos patriots giants rangers redsox money money1 dollar dollars
cash rich million bitcoin business company office work job manager boss
qwertyu qwertyui asdfg asdfghj zxcvb zxcvbnm1 qazwsxedc qweasd qweasdzxc
1qaz2wsx3edc poiuytrewq mnbvcxz lkjhgfdsa 0987654321 1234qwer 12qwaszx
123abc 123qweasd 123qweasdzxc qwerty12 qwerty1234 qwertz qwertz123 azerty
azerty123 azertyuiop letmein1 welcome123 welcome2 hello123 hello1
hellohello hi123 hey123 monday tuesday wednesday thursday friday saturday
sunday january february march april may june july august september october
november december black white red blue green yellow purple pink silver gold
diamond platinum crystal star stars sun moon sky ocean river mountain
forest nature earth world universe galaxy secret1 private hidden mypassword
mypass yourpassword nopassword password! password01 password02 password11
passw0rd1 p4ssw0rd pa55word pa55w0rd adminadmin admin1 admin1234 root123
rootroot superuser sysadmin system service server database oracle mysql
postgres linux ubuntu windows windows10 microsoft apple123 iphone samsung
android nokia motorola sony toshiba lenovo dell hp intel amd nvidia
jessica1 ashley amanda nicole melissa sarah samantha elizabeth emily emma
olivia sophia isabella mia charlotte amelia harper evelyn abigail madison
chloe grace lily hannah natalie victoria james john william david richard
joseph christopher matthew anthony mark donald steven paul joshua kevin
brian edward ronald timothy jason jeffrey ryan jacob gary nicholas eric
stephen jonathan larry justin scott brandon frank benjamin gregory samuel
raymond patrick alexander jack dennis jerry tyler aaron henry peter adam
nathan zachary douglas kyle walter harold carl arthur gerald roger keith
jeremy lawrence sean christian ethan austin joe albert jesse willie billy
bruce noah dylan ralph roy alan wayne eugene juan gabriel louis russell
randy vincent philip bobby johnny bradley qwerty321 asdf qwer zxcv 1111
0000 1234 4321 12341234 123412341234 11223344 123456123456 123456654321
1234554321 147852 147852369 963852741 741852963 0123456789 01234567890
1234567891 12345678910 iloveyou123 loveyou loveyou1 forever forever1 always
family family1 friends friend bestfriend mother father mommy daddy sister
brother husband wife son daughter grandma grandpa school student teacher
teacher1 classroom college university education homework study learning
happy smile funny crazy cool awesome amazing super great best perfect
summer2024 summer2025 summer2026 winter2024 winter2025 winter2026
spring2025 autumn2025 fall2025 wachtwoord wachtwoord1 wachtwoord12
wachtwoord123 wachtwoord1234 wachtwoord01 wachtw00rd wachtwoord! geheim
geheim123 geheimpje welkom welkom01 welkom1 welkom12 welkom123 welkom2024
welkom2025 welkom2026 welkomwelkom welkom01! voetbal voetbal1 voetbal123
voetballen ajax ajax1 ajax123 ajaxajax feyenoord feyenoord1 psv psv1
psveindhoven az alkmaar twente fctwente utrecht fcutrecht vitesse
heerenveen groningen fcgroningen sparta nac roda willemii nec excelsior
adodenhaag oranje oranje1 hupholland holland holland1 nederland nederland1
amsterdam rotterdam denhaag eindhoven tilburg almere breda nijmegen
apeldoorn haarlem arnhem enschede amersfoort zaandam leiden zwolle
maastricht dordrecht delft venlo deventer hilversum hengelo emmen friesland
drenthe overijssel gelderland zeeland brabant limburg flevoland hallo
hallo123 hallohallo doei doeidoei hoi hoihoi hoi123 dag goedemorgen
goedemiddag goedenavond schatje schat schatje1 lieverd liefje liefde
liefde1 ikhouvanjou houvanjou ikhouvanje kusjes knuffel mama papa mamma
pappa oma opa zus broer zoon dochter vader moeder familie gezin vriend
vriendin vrienden beste bestevriend vriendschap maandag dinsdag woensdag
donderdag vrijdag zaterdag zondag weekend januari februari maart mei juni
juli augustus oktober zomer lente herfst zomer2025 lente2025 herfst2025
zomer2026 zon maan ster sterren regen wolk wolken sneeuw ijs vuur water
aarde lucht hond hondje kat katje poes poesje paard paardje konijn hamster
vogel vis tijger leeuw beer beertje olifant aap aapje muis appel peer
banaan aardbei kers druif sinaasappel citroen kaas brood boter melk koffie
thee bier wijn pizza patat frikandel kroket stroopwafel drop snoep
chocolade chocola koekje taart fiets auto trein bus boot vliegtuig rood
blauw groen geel paars roze zwart wit grijs bruin goud zilver school1
school123 leerling leerlingen docent docent1 docent123 leraar lerares
mentor informatica computer1 laptop toets toetsen proefwerk huiswerk examen
cijfer rapport klas klas1 klas2 klas3 klas4 klas5 klas6 havo vwo vmbo mavo
atheneum gymnasium lyceum pensuma pensuma1 pensuma123 programmeren python
python1 python123 javascript java scratch geheimwoord inloggen inlog
login123 toegang gebruiker gebruikersnaam beheerder beheer admin2024 koning
koningin prins prinses kroon kasteel jan piet kees klaas henk gerrit willem
hendrik johannes cornelis pieter dirk bart joost sander thijs ruben lars
daan sem lucas levi finn milan luuk bram stijn tim tom rick niels anna
julia sophie lotte sanne lisa eva fleur lieke iris anouk femke noor sara
tess zoe mila nina maud roos isa yara lara esmee britt marco mike robin
martijn jeroen wouter maarten michiel erik hans jan-willem ingrid monique
marieke linda sandra petra anja ellen karin wendy qwertyuiopasdfghjkl
amstel heineken grolsch hertog bavaria nederlands engels duits frans
wiskunde biologie natuurkunde scheikunde geschiedenis aardrijkskunde muziek
tekenen gym sport sporten korfbal zwemmen schaatsen fietsen gezellig lekker
mooi leuk vrolijk blij gelukkig ikbenhet ikke ikzelf mijnwachtwoord
nieuwwachtwoord tijdelijk tijdelijk1 tijdelijk123 veranderen wijzigen
vergeten onthouden weetikniet geenidee niks niets sinterklaas kerstmis
kerst pasen koningsdag oudjaar nieuwjaar secret01 secret! qwerty01 qwerty!
iloveyou01 iloveyou! qwertyuiop1 qwertyuiop123 qwertyuiop01 qwertyuiop!
lovely1 lovely123 lovely01 lovely! princess1 princess123 princess01
princess! dragon123 dragon01 dragon! sunshine1 sunshine123 sunshine01
sunshine! football123 football01 football! monkey1 monkey123 monkey01
monkey! superman1 superman123 superman01 superman! welcome01 welcome!
admin01 admin! administrator1 administrator123 administrator01
administrator! letmein123 letmein01 letmein! login1 login01 login! master1
master123 master01 master! hello01 hello! freedom1 freedom123 freedom01
freedom! whatever1 whatever123 whatever01 whatever! qazwsx1 qazwsx123
qazwsx01 qazwsx! passwort1 passwort123 passwort01 passwort! baseball123
baseball01 baseball! shadow1 shadow123
`;

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  LIST.split(/\s+/).filter(Boolean),
);
