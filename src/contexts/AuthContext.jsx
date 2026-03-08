import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [hostUser, setHostUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, 'hostAdmins', user.uid));
        if (snap.exists()) {
          setHostUser(user);
          setIsHost(true);
        } else {
          await signOut(auth);
          setHostUser(null);
          setIsHost(false);
        }
      } else {
        setHostUser(null);
        setIsHost(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, 'hostAdmins', cred.user.uid));
    if (!snap.exists()) {
      await signOut(auth);
      throw new Error('Access denied. This portal is restricted to host administrators.');
    }
    return cred;
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ hostUser, loading, isHost, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
