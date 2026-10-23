/*
 * Dernier Signal — UNO R4 Minima
 *
 * Câblage :
 *   Corne    (sound sensor) : VCC→5V, GND→GND, SIG→A1
 *   Étoile   (photorésistance, pont diviseur) : 5V→LDR→A3, A3→10kΩ→GND
 *   Sablier  (tilt) : broche 11 ↔ GND (pull-up interne)
 *
 * Protocole série (115200 bauds, une ligne par message) :
 *   Arduino → web
 *     M:<0-1023>  amplitude crête-à-crête du micro (toutes les 30 ms)
 *     L:<0-1023>  luminosité (toutes les 100 ms)
 *     K           kick : le sablier a été retourné franchement
 *   Web → Arduino
 *     V           la LED intégrée clignote (retour visuel)
 */

const int MICRO = A1;
const int PHOTO = A3;
const int TILT = 11;
const int LED = LED_BUILTIN;

const unsigned long MICRO_PERIOD_MS = 30;
const unsigned long LIGHT_PERIOD_MS = 100;

// Un vrai geste = garder le contact ~150 ms (un micro-mouvement trop court est ignoré).
const unsigned long TILT_HOLD_MS = 150;
const unsigned long TILT_REARM_MS = 400;

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
unsigned long tiltContactSince = 0;
unsigned long tiltOpenSince = 0;
bool tiltInContact = false;
bool tiltArmed = true;

void updateHourglass(unsigned long now) {
  if (digitalRead(TILT) == LOW) {
    tiltOpenSince = 0;
    if (!tiltInContact) {
      tiltInContact = true;
      tiltContactSince = now;
    } else if (tiltArmed && now - tiltContactSince >= TILT_HOLD_MS) {
      Serial.println("K");
      tiltArmed = false;
    }
  } else {
    tiltInContact = false;
    if (!tiltArmed) {
      if (!tiltOpenSince) tiltOpenSince = now;
      else if (now - tiltOpenSince > TILT_REARM_MS) tiltArmed = true;
    }
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
}

void loop() {
  unsigned long now = millis();
  updateHorn(now);
  updateStar(now);
  updateHourglass(now);
  updateLed(now);
}
