import { useState } from 'react';
import { View, TextInput, Button } from 'react-native';
import { useAuth } from '../hooks/useAuth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, signUp, loading } = useAuth();

  return (
    <View className="flex-1 justify-center p-6">
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        className="border p-4 mb-4 rounded"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        className="border p-4 mb-4 rounded"
      />
      <Button title="Connexion" onPress={() => signIn(email, password)} disabled={loading} />
      <Button title="Inscription" onPress={() => signUp(email, password)} disabled={loading} />
    </View>
  );
}
