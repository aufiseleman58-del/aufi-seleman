import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Videos from './pages/Videos';
import Marketplace from './pages/Marketplace';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import Messages from './pages/Messages';
import Search from './pages/Search';
import Wallet from './pages/Wallet';
import Notifications from './pages/Notifications';
import ContentGenerator from './pages/ContentGenerator';
import { Toaster } from 'sonner';
import { AuthProvider } from './AuthContext';
import { SettingsProvider } from './SettingsContext';

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/videos" element={<Videos />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:userId" element={<Profile />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/search" element={<Search />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/creator" element={<ContentGenerator />} />
            </Routes>
          </Layout>
          <Toaster position="top-center" />
        </Router>
      </AuthProvider>
    </SettingsProvider>
  );
}
