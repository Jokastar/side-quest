import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { getDistance } from './useProximityCheck';
import type { QuestWithCoords } from './useNearbyQuests';

// États possibles du processus de validation photo :
// idle      → aucune photo, état initial
// capturing → la caméra est en train de s'ouvrir
// ready     → photo prise, prête à être envoyée à Gemini
// validating→ Gemini est en train d'analyser la photo
// approved  → Gemini a validé la photo, on peut compléter la quête
// rejected  → Gemini ou le check GPS a rejeté la photo
export type PhotoValidationState = 'idle' | 'capturing' | 'ready' | 'validating' | 'approved' | 'rejected';

export interface CapturedPhoto {
  uri: string;      // chemin local du fichier sur l'appareil
  base64?: string;  // données image encodées en base64, envoyées à Gemini
  exif?: Record<string, unknown>; // métadonnées EXIF (dont GPS si disponible)
}

export interface ValidationResult {
  valid: boolean;  // true = quête validée, false = rejetée
  reason: string;  // explication de Gemini en français
}

// Clé API Gemini stockée dans .env.local (EXPO_PUBLIC_GEMINI_API_KEY)
// ⚠️ À terme, déplacer cet appel dans une Supabase Edge Function pour ne pas exposer la clé
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY!;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

// Distance maximale entre le GPS de la photo et la position de la quête
const LOCATION_RADIUS_METERS = 50;

// Extrait les coordonnées GPS depuis les métadonnées EXIF de la photo
// iOS stocke le GPS sous la clé '{GPS}', Android le met directement à la racine
function extractGpsFromExif(exif: Record<string, unknown>): { latitude: number; longitude: number } | null {
  const gpsBlock = (exif['{GPS}'] as Record<string, unknown>) ?? exif;

  const lat = gpsBlock['GPSLatitude'] as number | undefined;
  const lon = gpsBlock['GPSLongitude'] as number | undefined;
  const latRef = gpsBlock['GPSLatitudeRef'] as string | undefined;
  const lonRef = gpsBlock['GPSLongitudeRef'] as string | undefined;

  if (lat == null || lon == null) return null;

  // Les références S et W indiquent des coordonnées négatives
  return {
    latitude: latRef === 'S' ? -lat : lat,
    longitude: lonRef === 'W' ? -lon : lon,
  };
}

export function usePhotoValidation() {
  const [state, setState] = useState<PhotoValidationState>('idle');
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // Ouvre la caméra native et récupère la photo avec base64 + EXIF
  const openCamera = async () => {
    setError(null);
    setValidationResult(null);
    setState('capturing');

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setError('Permission caméra refusée.');
      setState('idle');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,     // compression pour ne pas envoyer un fichier trop lourd à Gemini
      base64: true,      // nécessaire pour envoyer l'image directement à Gemini
      exif: true,        // nécessaire pour extraire le GPS et vérifier la localisation
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) {
      setState('idle');
      return;
    }

    const asset = result.assets[0];
    setPhoto({
      uri: asset.uri,
      base64: asset.base64 ?? undefined,
      exif: (asset.exif as Record<string, unknown>) ?? undefined,
    });
    setState('ready');
  };

  // Valide la photo en deux étapes :
  // 1. Vérifie que la photo a été prise à moins de 50m de la quête (via EXIF GPS)
  // 2. Envoie la photo à Gemini pour vérifier qu'elle correspond à la quête
  const validate = async (quest: QuestWithCoords) => {
    if (!photo?.base64) {
      setError('Aucune photo disponible.');
      return;
    }

    setState('validating');
    setError(null);

    // Étape 1 : vérification GPS via EXIF
    // Si l'EXIF contient des coordonnées GPS, on vérifie la distance
    // Si pas de GPS dans l'EXIF (certains appareils le désactivent), on passe directement à Gemini
    if (photo.exif) {
      const gps = extractGpsFromExif(photo.exif);
      if (gps) {
        const distance = getDistance(gps.latitude, gps.longitude, quest.latitude, quest.longitude);
        if (distance > LOCATION_RADIUS_METERS) {
          const result: ValidationResult = {
            valid: false,
            reason: `Photo prise trop loin de la quête (${Math.round(distance)} m). Tu dois être sur place.`,
          };
          setValidationResult(result);
          setState('rejected');
          return; // On arrête ici, pas besoin d'appeler Gemini
        }
      }
    }

    // Étape 2 : analyse de l'image par Gemini
    // On envoie le base64 de la photo + le titre et la description de la quête
    // Gemini répond en JSON : { valid: bool, reason: string }
    try {
      const prompt = `Tu es un validateur de quêtes pour un jeu de piste en réalité augmentée.

Quête: "${quest.title}"
Description: "${quest.description ?? 'Aucune description'}"

Le joueur a pris cette photo pour prouver qu'il a accompli la quête.
Vérifie si l'image correspond à la quête décrite.
Sois indulgent si l'image est globalement cohérente avec la quête.

Réponds UNIQUEMENT avec ce JSON (sans markdown):
{ "valid": true ou false, "reason": "explication courte en français (max 1 phrase)" }`;

      const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                // L'image est envoyée en base64 directement dans la requête (pas besoin d'URL publique)
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: photo.base64,
                },
              },
              { text: prompt },
            ],
          }],
        }),
      });

      if (!response.ok) throw new Error(`Gemini ${response.status}`);

      const data = await response.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      // Gemini peut parfois entourer le JSON de balises markdown ```json ... ```
      // On les supprime avant de parser
      const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
      const parsed: ValidationResult = JSON.parse(cleaned);

      setValidationResult(parsed);
      setState(parsed.valid ? 'approved' : 'rejected');
    } catch (e) {
      setError('Erreur de validation. Réessayez.');
      setState('ready');
    }
  };

  // Remet le hook à zéro (nouvelle tentative depuis le début)
  const reset = () => {
    setPhoto(null);
    setValidationResult(null);
    setState('idle');
    setError(null);
  };

  return { state, photo, error, validationResult, openCamera, validate, reset };
}
