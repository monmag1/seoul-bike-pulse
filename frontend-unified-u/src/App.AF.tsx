import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './af/components/Shared';
import Dashboard from './af/pages/Dashboard';
import Predictor from './af/pages/Predictor';
import Historical from './af/pages/Historical';
import MLOps from './af/pages/MLOps';
import Operations from './af/pages/Operations';
import './af.css';
export default function AFApp(){return <BrowserRouter><Routes><Route element={<Shell/>}><Route index element={<Navigate to="/dashboard" replace/>}/><Route path="/dashboard" element={<Dashboard/>}/><Route path="/predict" element={<Predictor/>}/><Route path="/historical" element={<Historical/>}/><Route path="/mlops" element={<MLOps/>}/><Route path="/operations" element={<Operations/>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Route></Routes></BrowserRouter>}
