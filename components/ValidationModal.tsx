import { View, Text, TouchableOpacity, ActivityIndicator, Pressable, Image } from 'react-native';
import { useGameStore } from '../store/gameStore';
import { usePhotoValidation } from '../hooks/usePhotoValidation';
import { supabase } from '../lib/supabase';

export default function ValidationModal() {
  const { activeQuest, completeQuest, cancelValidation } = useGameStore();
  const { state, photo, error, validationResult, openCamera, validate, reset } = usePhotoValidation();

  if (!activeQuest) return null;

  const handleComplete = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error: dbError } = await supabase.from('quest_submissions').insert({
        user_id: user.id,
        quest_id: activeQuest.id,
        xp_earned: activeQuest.xp_reward,
        status: 'approved',
        photo_url: photo?.uri ?? null,
      });
      if (dbError) console.error('[ValidationModal] insert error:', dbError.message);
    }
    completeQuest();
  };

  const isLoading = state === 'validating' || state === 'capturing';

  return (
    <Pressable className="absolute inset-0 bg-black/70 items-center justify-end pb-8 px-4">
      <Pressable onPress={(e) => e.stopPropagation()}>
        <View className="bg-gray-900 rounded-3xl p-6 w-full">
          <Text className="text-green-400 text-xs font-semibold uppercase tracking-widest mb-2">
            Zone atteinte ✓
          </Text>
          <Text className="text-white font-bold text-2xl mb-1">{activeQuest.title}</Text>
          <Text className="text-white/60 text-sm mb-4">{activeQuest.description}</Text>

          <View className="bg-purple-600/20 rounded-2xl p-4 mb-4 items-center">
            <Text className="text-purple-400 text-3xl font-bold">+{activeQuest.xp_reward} XP</Text>
            <Text className="text-purple-400/60 text-sm mt-1">à gagner</Text>
          </View>

          {/* Photo preview */}
          {photo && (
            <View className="mb-4 rounded-2xl overflow-hidden" style={{ height: 180 }}>
              <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </View>
          )}

          {/* Validation result */}
          {validationResult && !validationResult.valid && (
            <View className="bg-red-500/20 rounded-xl px-4 py-3 mb-4">
              <Text className="text-red-400 text-sm">{validationResult.reason}</Text>
            </View>
          )}

          {/* Error */}
          {error && (
            <View className="bg-red-500/20 rounded-xl px-4 py-3 mb-4">
              <Text className="text-red-400 text-sm">{error}</Text>
            </View>
          )}

          {/* Action buttons */}
          {state === 'approved' ? (
            <TouchableOpacity
              className="bg-green-500 rounded-xl py-4 items-center mb-3"
              onPress={handleComplete}
            >
              <Text className="text-white font-bold text-base">Valider la quête</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className="bg-purple-600 rounded-xl py-4 items-center mb-3"
              onPress={state === 'ready' || state === 'rejected' ? () => validate(activeQuest) : openCamera}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base">
                  {state === 'idle' && '📷 Prendre une photo'}
                  {state === 'ready' && '✓ Valider avec Gemini'}
                  {state === 'rejected' && '🔄 Réessayer la validation'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Retake photo if rejected */}
          {state === 'rejected' && (
            <TouchableOpacity
              className="bg-white/10 rounded-xl py-3 items-center mb-3"
              onPress={() => { reset(); openCamera(); }}
            >
              <Text className="text-white/60 text-sm">📷 Reprendre une photo</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            className="bg-white/10 rounded-xl py-3 items-center"
            onPress={cancelValidation}
            disabled={isLoading}
          >
            <Text className="text-white/60 text-sm">Retour à la navigation</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Pressable>
  );
}
