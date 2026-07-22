import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Videos from './pages/Videos';
import Reels from './pages/Reels';
import Marketplace from './pages/Marketplace';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import Messages from './pages/Messages';
import Search from './pages/Search';
import Wallet from './pages/Wallet';
import Notifications from './pages/Notifications';
import ZathuAssistant from './pages/ZathuAssistant';
import ArtStudio from './pages/ArtStudio';
import { Toaster } from 'sonner';
import { AuthProvider } from './AuthContext';
import { SettingsProvider } from './SettingsContext';
import { CallProvider } from './CallContext';

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <CallProvider>
          <Router>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/reels" element={<Reels />} />
                <Route path="/videos" element={<Videos />} />
                <Route path="/marketplace" element={<Marketplace />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/profile/:userId" element={<Profile />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/search" element={<Search />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/assistant" element={<ZathuAssistant />} />
                <Route path="/studio" element={<ArtStudio />} />
              </Routes>
            </Layout>
            <Toaster position="top-center" />
          </Router>
        </CallProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
