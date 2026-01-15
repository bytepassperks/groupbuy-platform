'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion';
import Button from '@/components/ui/Button';
import { Shield, Zap, Users, Lock, Monitor, Apple, Smartphone, Download, Chrome, Star, CheckCircle, Clock, Sparkles } from 'lucide-react';

const AnimatedCounter = ({ target, duration = 2000, suffix = '' }: { target: number; duration?: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
};

const LiveActivityNotification = () => {
  const [notification, setNotification] = useState<{ name: string; action: string; time: string } | null>(null);
  const names = ['Raj', 'Priya', 'Amit', 'Sarah', 'John', 'Emma', 'Alex', 'Maya', 'David', 'Lisa', 'Arjun', 'Neha'];
  const cities = ['Mumbai', 'Delhi', 'Bangalore', 'New York', 'London', 'Singapore', 'Dubai', 'Sydney'];
  const actions = ['just joined EliteAccess', 'unlocked Premium Access', 'started their free trial', 'upgraded to Pro'];

  useEffect(() => {
    const showNotification = () => {
      const name = names[Math.floor(Math.random() * names.length)];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const action = actions[Math.floor(Math.random() * actions.length)];
      setNotification({ name: `${name} from ${city}`, action, time: 'Just now' });
      setTimeout(() => setNotification(null), 4000);
    };

    const interval = setInterval(showNotification, 8000);
    setTimeout(showNotification, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, x: -100, y: 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: -100 }}
          className="fixed bottom-6 left-6 bg-white rounded-lg shadow-2xl p-4 z-50 max-w-sm border-l-4 border-green-500"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{notification.name}</p>
              <p className="text-gray-600 text-xs">{notification.action}</p>
              <p className="text-gray-400 text-xs">{notification.time}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const CountdownTimer = () => {
  const [timeLeft, setTimeLeft] = useState({ hours: 23, minutes: 47, seconds: 32 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        let { hours, minutes, seconds } = prev;
        seconds--;
        if (seconds < 0) { seconds = 59; minutes--; }
        if (minutes < 0) { minutes = 59; hours--; }
        if (hours < 0) { hours = 23; minutes = 59; seconds = 59; }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex gap-2 justify-center">
      {[
        { value: timeLeft.hours, label: 'HRS' },
        { value: timeLeft.minutes, label: 'MIN' },
        { value: timeLeft.seconds, label: 'SEC' },
      ].map((item, i) => (
        <div key={i} className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2 min-w-[60px]">
          <div className="text-2xl font-bold text-white">{String(item.value).padStart(2, '0')}</div>
          <div className="text-xs text-white/70">{item.label}</div>
        </div>
      ))}
    </div>
  );
};

const StickyUrgencyBar = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [spotsLeft, setSpotsLeft] = useState(12);

  useEffect(() => {
    const handleScroll = () => setIsVisible(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpotsLeft(prev => Math.max(3, prev - (Math.random() > 0.7 ? 1 : 0)));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          exit={{ y: -100 }}
          className="fixed top-0 left-0 right-0 bg-gradient-to-r from-red-600 to-orange-500 text-white py-3 px-4 z-50 shadow-lg"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="flex items-center gap-2"
              >
                <Clock className="w-5 h-5" />
                <span className="font-semibold">Limited Time Offer!</span>
              </motion.div>
              <span className="hidden sm:inline">Only <strong>{spotsLeft} spots</strong> left at this price</span>
            </div>
            <Link href="/register">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-white text-red-600 px-4 py-1.5 rounded-full font-semibold text-sm"
              >
                Claim Now
              </motion.button>
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function Home() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '50%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  const features = [
    { icon: Shield, title: 'Secure Access', description: 'Your credentials are encrypted with AES-256 and never exposed to users.' },
    { icon: Zap, title: 'Instant Access', description: 'Get immediate access to premium tools through our secure desktop and mobile apps.' },
    { icon: Users, title: 'Group Buying', description: 'Share costs with others and access premium tools at a fraction of the price.' },
    { icon: Lock, title: 'Privacy First', description: 'Credentials are completely hidden - no way to view or steal them.' },
  ];

  const testimonials = [
    { name: 'Rahul S.', role: 'Digital Marketer', text: 'EliteAccess saved me over $500/month on SEO tools. The access is seamless!', rating: 5 },
    { name: 'Emily W.', role: 'Freelance Designer', text: 'Finally affordable access to Canva Pro and other design tools. Game changer!', rating: 5 },
    { name: 'Arjun P.', role: 'Startup Founder', text: 'The security is top-notch. I trust EliteAccess with all my team subscriptions.', rating: 5 },
  ];

  const downloadBaseUrl = 'https://github.com/bytepassperks/groupbuy-platform/releases/download/v2.0.0';

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <div className="overflow-hidden">
      <LiveActivityNotification />
      <StickyUrgencyBar />

      {/* Hero Section with Parallax */}
      <section ref={heroRef} className="relative min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 text-white overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-white/10 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{
                y: [0, -30, 0],
                opacity: [0.1, 0.3, 0.1],
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2,
              }}
            />
          ))}
        </div>

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 pt-32">
            {/* Live Viewers Badge */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-center mb-6"
            >
              <div className="bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-2 h-2 bg-red-500 rounded-full"
                />
                <span className="text-sm"><AnimatedCounter target={47} duration={1000} /> people viewing right now</span>
              </div>
            </motion.div>

            <div className="text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="flex justify-center mb-6"
              >
                <Image src="/logo.png" alt="EliteAccess" width={100} height={100} className="rounded-2xl shadow-lg" />
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="text-4xl md:text-6xl font-bold mb-6"
              >
                Premium Tools at{' '}
                <motion.span
                  className="text-amber-400 inline-block"
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  Affordable Prices
                </motion.span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-xl md:text-2xl text-blue-100 mb-6 max-w-3xl mx-auto"
              >
                Access Semrush, Ahrefs, Canva Pro, and more through our secure premium access platform.
              </motion.p>

              {/* Urgency Banner */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
                className="mb-8"
              >
                <div className="inline-block bg-red-500/20 backdrop-blur-sm rounded-lg px-6 py-3 border border-red-400/30">
                  <p className="text-sm mb-2">Early Bird Pricing Ends In:</p>
                  <CountdownTimer />
                </div>
              </motion.div>

              {/* Member Count */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mb-8 flex items-center justify-center gap-2"
              >
                <div className="flex -space-x-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 border-2 border-white flex items-center justify-center text-xs font-bold">
                      {String.fromCharCode(65 + i)}
                    </div>
                  ))}
                </div>
                <span className="text-blue-100">
                  Join <strong className="text-white"><AnimatedCounter target={2547} duration={2000} />+</strong> satisfied members
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="flex flex-col sm:flex-row gap-4 justify-center"
              >
                <Link href="/products">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button size="lg" className="bg-amber-500 text-gray-900 hover:bg-amber-400 font-semibold">
                      Browse Products
                    </Button>
                  </motion.div>
                </Link>
                <Link href="/register">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    animate={{ boxShadow: ['0 0 0 0 rgba(255,255,255,0.4)', '0 0 0 10px rgba(255,255,255,0)', '0 0 0 0 rgba(255,255,255,0)'] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="rounded-lg"
                  >
                    <Button size="lg" className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-blue-900">
                      Get Started Free
                    </Button>
                  </motion.div>
                </Link>
              </motion.div>

              {/* Trust Badges */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="mt-8 flex items-center justify-center gap-6 text-sm text-blue-200"
              >
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Secure Payments
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Instant Access
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> 24/7 Support
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Social Proof Section */}
      <section className="py-16 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap items-center justify-center gap-8 md:gap-16"
          >
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900"><AnimatedCounter target={2547} />+</div>
              <div className="text-gray-600">Active Members</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900"><AnimatedCounter target={50} />+</div>
              <div className="text-gray-600">Premium Tools</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">$<AnimatedCounter target={125000} />+</div>
              <div className="text-gray-600">Saved by Users</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900"><AnimatedCounter target={99} suffix="%" /></div>
              <div className="text-gray-600">Satisfaction Rate</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Choose EliteAccess?</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">We provide secure, affordable access to premium tools without compromising on security or quality.</p>
          </motion.div>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ y: -5, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                className="bg-white p-6 rounded-lg shadow-md text-center transition-all"
              >
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4"
                >
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </motion.div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
          </motion.div>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              { num: '1', title: 'Choose a Product', desc: 'Browse our catalog of premium tools and select the one you need.' },
              { num: '2', title: 'Complete Purchase', desc: 'Pay securely and receive your unique access code instantly.' },
              { num: '3', title: 'Download & Access', desc: 'Download our secure app for your platform and enter your access code to start using your tools.' },
            ].map((step, index) => (
              <motion.div
                key={step.num}
                variants={itemVariants}
                className="text-center"
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  animate={{ boxShadow: ['0 0 0 0 rgba(37,99,235,0.4)', '0 0 0 20px rgba(37,99,235,0)', '0 0 0 0 rgba(37,99,235,0)'] }}
                  transition={{ repeat: Infinity, duration: 2, delay: index * 0.3 }}
                  className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold"
                >
                  {step.num}
                </motion.div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-4">What Our Members Say</h2>
            <p className="text-lg text-gray-600">Join thousands of satisfied users</p>
          </motion.div>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ y: -5 }}
                className="bg-white p-6 rounded-lg shadow-md"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      viewport={{ once: true }}
                    >
                      <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    </motion.div>
                  ))}
                </div>
                <p className="text-gray-600 mb-4">&quot;{testimonial.text}&quot;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{testimonial.name}</p>
                    <p className="text-sm text-gray-500">{testimonial.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Limited Time Offer Section */}
      <section className="py-20 bg-gradient-to-r from-red-600 to-orange-500 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 0.5, repeatDelay: 2 }}
              className="inline-block mb-4"
            >
              <Sparkles className="w-12 h-12" />
            </motion.div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Limited Time Offer!</h2>
            <p className="text-xl mb-6">Get 50% off your first month - Only for new members</p>
            
            <div className="mb-8">
              <CountdownTimer />
            </div>

            <div className="mb-8">
              <div className="inline-block bg-white/20 rounded-full px-6 py-2">
                <span className="font-semibold">87% claimed</span> - Only 13 spots left!
              </div>
            </div>

            <div className="w-full max-w-md mx-auto mb-8">
              <div className="bg-white/20 rounded-full h-4 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: '87%' }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                  viewport={{ once: true }}
                  className="h-full bg-white rounded-full"
                />
              </div>
            </div>

            <Link href="/register">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={{ boxShadow: ['0 0 0 0 rgba(255,255,255,0.4)', '0 0 0 15px rgba(255,255,255,0)', '0 0 0 0 rgba(255,255,255,0)'] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="bg-white text-red-600 px-8 py-4 rounded-full font-bold text-lg shadow-lg"
              >
                Claim Your 50% Discount Now
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Download Apps Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Our Apps</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Access your subscriptions securely on any device with our dedicated applications.</p>
          </motion.div>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            <motion.a
              href={`${downloadBaseUrl}/EliteAccess-Setup-Windows.exe`}
              variants={itemVariants}
              whileHover={{ y: -5, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
              className="bg-white p-6 rounded-lg shadow-md text-center group"
            >
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors"
              >
                <Chrome className="w-8 h-8 text-blue-600" />
              </motion.div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">EliteAccess</h3>
              <p className="text-sm text-gray-600 mb-4">Windows - Recommended</p>
              <span className="inline-flex items-center text-blue-600 font-medium">
                <Download className="w-4 h-4 mr-2" />
                Download
              </span>
            </motion.a>
            <motion.a
              href={`${downloadBaseUrl}/EliteAccess-Setup-macOS.dmg`}
              variants={itemVariants}
              whileHover={{ y: -5, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
              className="bg-white p-6 rounded-lg shadow-md text-center group"
            >
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-gray-200 transition-colors"
              >
                <Apple className="w-8 h-8 text-gray-800" />
              </motion.div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">EliteAccess</h3>
              <p className="text-sm text-gray-600 mb-4">macOS</p>
              <span className="inline-flex items-center text-blue-600 font-medium">
                <Download className="w-4 h-4 mr-2" />
                Download
              </span>
            </motion.a>
            <motion.a
              href={`${downloadBaseUrl}/EliteAccess-Linux.AppImage`}
              variants={itemVariants}
              whileHover={{ y: -5, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
              className="bg-white p-6 rounded-lg shadow-md text-center group"
            >
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-purple-200 transition-colors"
              >
                <Monitor className="w-8 h-8 text-purple-600" />
              </motion.div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">EliteAccess</h3>
              <p className="text-sm text-gray-600 mb-4">Linux / Chromebook</p>
              <span className="inline-flex items-center text-blue-600 font-medium">
                <Download className="w-4 h-4 mr-2" />
                Download
              </span>
            </motion.a>
            <motion.a
              href={`${downloadBaseUrl}/EliteAccess.apk`}
              variants={itemVariants}
              whileHover={{ y: -5, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
              className="bg-white p-6 rounded-lg shadow-md text-center group"
            >
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-green-200 transition-colors"
              >
                <Smartphone className="w-8 h-8 text-green-600" />
              </motion.div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">EliteAccess</h3>
              <p className="text-sm text-gray-600 mb-4">Android</p>
              <span className="inline-flex items-center text-blue-600 font-medium">
                <Download className="w-4 h-4 mr-2" />
                Download
              </span>
            </motion.a>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-8 text-center"
          >
            <p className="text-sm text-gray-500">All apps feature maximum security: credentials are completely hidden, DevTools disabled, and auto-logout on close.</p>
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-xl text-blue-100 mb-4">Join <strong><AnimatedCounter target={2547} />+</strong> users saving money on premium tools.</p>
            <p className="text-blue-200 mb-8">50% of new members claimed their discount in the last 24 hours</p>
            <Link href="/register">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={{ boxShadow: ['0 0 0 0 rgba(255,255,255,0.4)', '0 0 0 15px rgba(255,255,255,0)', '0 0 0 0 rgba(255,255,255,0)'] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="bg-white text-blue-600 px-8 py-4 rounded-lg font-bold text-lg shadow-lg hover:bg-blue-50"
              >
                Create Free Account
              </motion.button>
            </Link>
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              viewport={{ once: true }}
              className="mt-6 flex items-center justify-center gap-4"
            >
              {['No credit card required', 'Cancel anytime', 'Instant access'].map((text, i) => (
                <div key={i} className="flex items-center gap-1 text-sm text-blue-200">
                  <CheckCircle className="w-4 h-4" /> {text}
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
