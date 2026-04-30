import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import ProtectedRoute, { AdminRoute, CatchAllRedirect } from './ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import CompaniesPage from './pages/CompaniesPage';
import CompanyDetailPage from './pages/CompanyDetailPage';
import MeetingRecordingDetailPage from './pages/MeetingDetailPage';
import MeetingPage from './pages/MeetingPage';
import CalendarPage from './pages/CalendarPage';
import SalesRepsPage from './pages/SalesRepsPage';
import SalesRepDetailPage from './pages/SalesRepDetailPage';
import DealsPage from './pages/DealsPage';
import MeetingRecordingsPage from './pages/MeetingRecordingsPage';
import LeadsPage from './pages/LeadsPage';
import ChatPage from './pages/ChatPage';
import DialerPage from './pages/DialerPage';
import InboxPage from './pages/InboxPage';
import EmailsPage from './pages/EmailsPage';
import SettingsPage from './pages/SettingsPage';
import { Toaster } from 'react-hot-toast';

export default function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#18181b',
            border: '1px solid #e4e4e7',
            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
            padding: '12px 16px',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
          },
          success: {
            iconTheme: { primary: '#22c55e', secondary: '#ffffff' },
          },
        }}
      />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CatchAllRedirect />} />
            <Route path="companies" element={<CompaniesPage />} />
            <Route path="companies/:id" element={<CompanyDetailPage />} />
            <Route path="deals" element={<DealsPage />} />
            <Route path="leads/*" element={<LeadsPage />} />
            <Route path="meetings/:id" element={<MeetingPage />} />
            <Route path="sales-reps" element={<SalesRepsPage />} />
            <Route path="sales-reps/:id" element={<SalesRepDetailPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="chat/:conversationId" element={<ChatPage />} />
            <Route path="dialer" element={<DialerPage />} />
            <Route path="emails" element={<AdminRoute><EmailsPage /></AdminRoute>} />
            <Route path="calendar" element={<AdminRoute><CalendarPage /></AdminRoute>} />
            <Route path="inbox" element={<AdminRoute><InboxPage /></AdminRoute>} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="meeting-recordings" element={<AdminRoute><MeetingRecordingsPage /></AdminRoute>} />
            <Route path="meeting-recordings/:id" element={<AdminRoute><MeetingRecordingDetailPage /></AdminRoute>} />
            <Route path="*" element={<CatchAllRedirect />} />
          </Route>
          <Route path="*" element={<CatchAllRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
