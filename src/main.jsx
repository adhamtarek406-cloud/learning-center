import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MotionConfig } from 'framer-motion'
import './styles.css'

createRoot(document.getElementById('root')).render(<MotionConfig reducedMotion="user"><App /></MotionConfig>)
