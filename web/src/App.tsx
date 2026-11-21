import { Routes, Route } from "react-router-dom"; import AppLayout from "./layouts/AppLayout";
import Login from "./pages/Login"; import Dashboard from "./pages/Dashboard"; import Circles from "./pages/Circles"; import Loans from "./pages/Loans";
import AI from "./pages/AI"; import Pay from "./pages/Pay"; import Ledger from "./pages/Ledger";
export default function App() { return (<Routes><Route path="/login" element={<Login />} />
  <Route element={<AppLayout />}><Route index element={<Dashboard />} /><Route path="circles" element={<Circles />} /><Route path="loans" element={<Loans />} />
    <Route path="pay/:circleId" element={<Pay />} /><Route path="ledger" element={<Ledger />} /><Route path="ai" element={<AI />} /></Route></Routes>); }
