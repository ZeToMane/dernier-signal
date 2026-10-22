/*
 * Dernier Signal — UNO R4 Minima
 *
 * Câblage :
 *   Corne    (sound sensor) : VCC→5V, GND→GND, SIG→A1
 *   Étoile   (photorésistance, pont diviseur) : 5V→LDR→A3, A3→10kΩ→GND
 *   Sablier  (tilt) : broche 2 ↔ GND (pull-up interne, pas de fil 5V)
 *
 * Protocole série (115200 bauds, une ligne par message) :
 *   Arduino → web
 *     M:<0-1023>  amplitude crête-à-crête du micro (toutes les 30 ms)
 *     L:<0-1023>  luminosité (toutes les 100 ms)
 *     T:<0|1>     état validé du tilt : 1 = contact, 0 = ouvert (à chaque kick + toutes les 100 ms)
 *     K           kick : le sablier a été retourné (dans un sens ou dans l'autre)
 *   Web → Arduino
 *     V           la LED intégrée clignote (retour visuel)
 */

const int MICRO = A1;
const int PHOTO = A3;
const int TILT = 2;
const int LED = LED_BUILTIN;

const unsigned long MICRO_PERIOD_MS = 30;
const unsigned long LIGHT_PERIOD_MS = 100;

const unsigned long TILT_PERIOD_MS = 100;
// Le nouvel état doit tenir ce temps pour compter (ignore la bille qui grésille en bougeant).
// Doit rester bien sous la fenêtre de jeu (120 ms) pour que le kick ne soit pas en retard.
const unsigned long TILT_STABLE_MS = 40;
// Après un kick, plus rien n'est compté pendant ce temps (rebonds de fin de retournement).
// Doit rester sous l'écart entre deux kicks du morceau (750 ms).
const unsigned long TILT_LOCKOUT_MS = 350;

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

void updateLed(unsigned long now) {
  while (Serial.available()) {
    if (Serial.read() == 'V') {
      blinking = true;
      blinkStart = now;
    }
  }

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

void loop() {
  unsigned long now = millis();
  updateHorn(now);
  updateStar(now);
  updateHourglass(now);
  updateLed(now);
}
