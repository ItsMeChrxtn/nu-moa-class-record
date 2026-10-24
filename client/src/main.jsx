import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './Layout.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import AdminHome from './pages/AdminHome.jsx';
import FacultyHome from './pages/FacultyHome.jsx';
import SectionRecord from './pages/SectionRecord.jsx';
import StudentRecords from './pages/StudentRecords.jsx';
import { PageLoader, UIProvider } from './ui.jsx';
import './styles.css';

function Guard({ role, children }) {
  const { user } = useAuth();
  if (user === undefined) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  if (user === undefined) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  const home = { admin: '/admin', faculty: '/faculty' }[user.role] || '/records';
  return <Navigate to={home} replace />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <UIProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/admin" element={<Guard role="admin"><AdminHome /></Guard>} />
              <Route path="/faculty" element={<Guard role="faculty"><FacultyHome /></Guard>} />
              <Route path="/faculty/sections/:id" element={<Guard role="faculty"><SectionRecord /></Guard>} />
              <Route path="/records" element={<Guard role="student"><StudentRecords /></Guard>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </UIProvider>
    </AuthProvider>
  </React.StrictMode>
);
