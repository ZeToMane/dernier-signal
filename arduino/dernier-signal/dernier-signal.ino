/*
 * Dernier Signal — UNO R4 Minima
 *
 * Câblage :
 *   Corne    (sound sensor) : VCC→5V, GND→GND, SIG→A1
 *   Étoile   (photorésistance, pont diviseur) : 5V→LDR→A3, A3→10kΩ→GND
 *   Sablier  (tilt) : broche 11 ↔ GND (pull-up interne, pas de fil 5V)
 *
 * Protocole série (115200 bauds, une ligne par message) :
 *   Arduino → web
 *     M:<0-1023>  amplitude crête-à-crête du micro (toutes les 30 ms)
 *     L:<0-1023>  luminosité (toutes les 15 ms)
 *     T:<0|1>     état validé du tilt : 1 = contact, 0 = ouvert (à chaque kick + toutes les 100 ms)
 *     K           kick : le sablier a été retourné (dans un sens ou dans l'autre)
 *   Web → Arduino
 *     V           la LED intégrée clignote (retour visuel)
 *     R           remise à zéro de l'état (envoyé par la page à chaque connexion)
 *
 * L'UNO R4 ne redémarre pas quand une page ouvre le port : sans page connectée, rien n'est
 * envoyé (sinon le tampon USB plein ralentit loop()), et l'état repart à zéro à la connexion.
 */

const int MICRO = A1;
const int PHOTO = A3;
const int TILT = 11;
const int LED = LED_BUILTIN;

const unsigned long MICRO_PERIOD_MS = 30;
// Court : Star.ts valide après 2 mesures, donc latence ≈ 2 × période (doit rester ≪ 120 ms).
const unsigned long LIGHT_PERIOD_MS = 15;

const unsigned long TILT_PERIOD_MS = 100;
// Le nouvel état doit tenir ce temps pour compter (ignore la bille qui grésille en bougeant).
// Doit rester bien sous la fenêtre de jeu (120 ms) pour que le kick ne soit pas en retard.
const unsigned long TILT_STABLE_MS = 35;
// Après un kick, plus rien n'est compté pendant ce temps (rebonds de fin de retournement).
// Doit rester sous l'écart entre deux kicks du morceau (750 ms).
// ~230 ms : assez pour les rebonds, assez court pour accepter le retournement inverse.
const unsigned long TILT_LOCKOUT_MS = 230;

// ---- Corne ------------------------------------------------------------------
int microMin = 1023;
int microMax = 0;
unsigned long microSentAt = 0;

void updateHorn(unsigned long now) {
  int v = analogRead(MICRO);
  if (v < microMin) microMin = v;
  if (v > microMax) microMax = v;

  if (now - microSentAt >= MICRO_PERIOD_MS) {
    Serial.print("M:");
    Serial.println(microMax - microMin);
    microMin = 1023;
    microMax = 0;
    microSentAt = now;
  }
}

// ---- Étoile -----------------------------------------------------------------
unsigned long lightSentAt = 0;

void updateStar(unsigned long now) {
  if (now - lightSentAt < LIGHT_PERIOD_MS) return;
  Serial.print("L:");
  Serial.println(analogRead(PHOTO));
  lightSentAt = now;
}

// ---- Sablier ----------------------------------------------------------------
// Le tilt n'est fermé que dans un sens : chaque retournement change son état,
// donc un kick part à chaque changement validé (ouvert → contact ET contact → ouvert).
int tiltRaw = HIGH;
unsigned long tiltRawSince = 0;
int tiltStable = HIGH;
unsigned long tiltKickAt = 0;
unsigned long tiltSentAt = 0;

void sendTiltState() {
  Serial.print("T:");
  Serial.println(tiltStable == LOW ? 1 : 0);
}

void updateHourglass(unsigned long now) {
  int state = digitalRead(TILT);
  if (state != tiltRaw) {
    tiltRaw = state;
    tiltRawSince = now;
  }

  bool settled = now - tiltRawSince >= TILT_STABLE_MS;
  bool rearmed = now - tiltKickAt >= TILT_LOCKOUT_MS;

  if (tiltRaw != tiltStable && settled && rearmed) {
    tiltStable = tiltRaw;
    tiltKickAt = now;
    Serial.println("K");
    sendTiltState();
    tiltSentAt = now;
  } else if (now - tiltSentAt >= TILT_PERIOD_MS) {
    sendTiltState();
    tiltSentAt = now;
  }
}

// ---- LED --------------------------------------------------------------------
unsigned long blinkStart = 0;
bool blinking = false;

// ---- Remise à zéro ----------------------------------------------------------
void resetState(unsigned long now) {
  microMin = 1023;
  microMax = 0;
  microSentAt = now;
  lightSentAt = now;
  // Position actuelle = nouvelle référence, sans kick fantôme.
  tiltRaw = tiltStable = digitalRead(TILT);
  tiltRawSince = now;
  tiltKickAt = now;
  tiltSentAt = 0;
  blinking = false;
  digitalWrite(LED, LOW);
}

void readCommands(unsigned long now) {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'V') {
      blinking = true;
      blinkStart = now;
    } else if (c == 'R') {
      resetState(now);
    }
  }
}

void updateLed(unsigned long now) {
  if (!blinking) return;
  unsigned long t = now - blinkStart;
  digitalWrite(LED, (t < 80 || (t >= 160 && t < 240)) ? HIGH : LOW);
  if (t >= 240) blinking = false;
}

// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(TILT, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  // Position de départ = référence, sans kick au démarrage.
  tiltRaw = tiltStable = digitalRead(TILT);
}

bool wasConnected = false;

void loop() {
  unsigned long now = millis();
  // Serial = une page a ouvert le port (DTR). Sans page : on n'envoie rien.
  bool connected = Serial;
  if (connected && !wasConnected) resetState(now);
  wasConnected = connected;
  if (!connected) return;

  readCommands(now);
  updateHorn(now);
  updateStar(now);
  updateHourglass(now);
  updateLed(now);
}
