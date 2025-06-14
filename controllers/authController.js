const User = require('../models/user');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { validationResult } = require('express-validator');

async function sendVerificationEmail(user, req) {
    const token = crypto.randomBytes(20).toString('hex');
    user.verificationToken = token;
    user.verificationTokenExpires = Date.now() + 3600000; // 1 jam
    await user.save();

    const verificationUrl = `${req.protocol}://${req.get('host')}/verify-email/${token}`;

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || 587),
        secure: (process.env.SMTP_PORT === '465'),
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: process.env.NODE_ENV === 'production' // Lebih ketat di produksi
        }
    });

    const mailOptions = {
        from: `"${process.env.STORE_NAME}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to: user.email,
        subject: `Verifikasi Email Akun ${process.env.STORE_NAME}`,
        html: `<p>Halo ${user.username},</p>
               <p>Terima kasih telah mendaftar di ${process.env.STORE_NAME}. Silakan klik link berikut untuk memverifikasi alamat email Anda:</p>
               <p><a href="${verificationUrl}">${verificationUrl}</a></p>
               <p>Jika Anda tidak mendaftar, abaikan email ini.</p>
               <p>Link ini akan kadaluarsa dalam 1 jam.</p>
               <p>Salam,<br>Tim ${process.env.STORE_NAME}</p>`,
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error mengirim email verifikasi:', error);
        throw new Error('Gagal mengirim email verifikasi.');
    }
}

exports.getRegisterPage = (req, res) => {
    res.render('auth/register', { pageTitle: 'Register Akun Baru' });
};

exports.postRegister = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_messages', errors.array().map(err => err.msg));
        return res.redirect('/register');
    }

    const { username, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        req.flash('error_messages', 'Password dan konfirmasi password tidak cocok.');
        return res.redirect('/register');
    }

    try {
        let user = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] });
        if (user) {
            req.flash('error_messages', 'Email atau username sudah terdaftar.');
            return res.redirect('/register');
        }

        user = new User({
            username: username,
            email: email.toLowerCase(),
            password: password, // Hashing akan dilakukan oleh pre-save hook di model User
        });

        await user.save();
        
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            await sendVerificationEmail(user, req);
            req.flash('success_messages', 'Registrasi berhasil! Silakan cek email Anda untuk verifikasi akun.');
        } else {
            console.warn('SMTP tidak dikonfigurasi, email verifikasi tidak dikirim. User otomatis terverifikasi.');
            user.isVerified = true; // Otomatis verifikasi jika SMTP tidak ada
            await user.save();
            req.flash('success_messages', 'Registrasi berhasil! Akun Anda telah aktif. Silakan login.');
        }
        
        res.redirect('/login');
    } catch (error) {
        console.error('Error saat registrasi:', error);
        if (error.message.includes('Gagal mengirim email verifikasi')) {
             req.flash('error_messages', 'Registrasi berhasil, namun gagal mengirim email verifikasi. Hubungi admin.');
        } else {
            req.flash('error_messages', 'Terjadi kesalahan saat registrasi.');
        }
        res.redirect('/register');
    }
};

exports.getLoginPage = (req, res) => {
    res.render('auth/login', { pageTitle: 'Login ke Akun Anda' });
};

exports.postLogin = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Menggunakan error_messages agar konsisten dengan middleware global
        req.flash('error_messages', errors.array().map(err => err.msg));
        return res.redirect('/login');
    }

    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            req.flash('error_messages', 'Email atau password salah.');
            return res.redirect('/login');
        }

        const isMatch = await user.comparePassword(password); // Pastikan metode ini ada di model User
        if (!isMatch) {
            req.flash('error_messages', 'Email atau password salah.');
            return res.redirect('/login');
        }

        if (!user.isVerified) {
            req.flash('error_messages', 'Akun Anda belum diverifikasi. Silakan cek email Anda.');
            // Di sini Anda bisa menambahkan logika untuk mengirim ulang email verifikasi jika diperlukan
            return res.redirect('/login');
        }

        req.session.user = { // Simpan data user yang relevan ke session
            _id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            balance: user.balance,
            isVerified: user.isVerified,
            isReseller: user.isReseller,
            isSeller: user.isSeller,
            sellerApplicationStatus: user.sellerApplicationStatus,
            apiKey: user.apiKey 
        };
        req.session.userId = user._id.toString(); // Simpan juga userId untuk kemudahan

        req.session.save(err => {
            if (err) {
                console.error("Session save error:", err);
                req.flash('error_messages', 'Terjadi masalah saat login, coba lagi.');
                return res.redirect('/login');
            }
            req.flash('success_messages', 'Login berhasil! Selamat datang kembali.');
            const returnTo = req.session.returnTo || (user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard');
            delete req.session.returnTo;
            res.redirect(returnTo);
        });

    } catch (error) {
        console.error('Error saat login:', error);
        req.flash('error_messages', 'Terjadi kesalahan server saat mencoba login.');
        res.redirect('/login');
    }
};

exports.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error saat logout:', err);
            req.flash('error_messages', 'Gagal logout, silakan coba lagi.');
            return res.redirect('back'); // Kembali ke halaman sebelumnya jika logout gagal
        }
        res.clearCookie('connect.sid'); // Nama cookie default express-session
        req.flash('success_messages', 'Anda telah berhasil logout.');
        res.redirect('/login');
    });
};

exports.verifyEmail = async (req, res) => {
    try {
        const user = await User.findOne({
            verificationToken: req.params.token,
            verificationTokenExpires: { $gt: Date.now() },
        });

        if (!user) {
            req.flash('error_messages', 'Token verifikasi tidak valid atau sudah kadaluarsa.');
            return res.redirect('/login');
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

        req.flash('success_messages', 'Email berhasil diverifikasi! Silakan login.');
        res.redirect('/login');
    } catch (error) {
        console.error('Error verifikasi email:', error);
        req.flash('error_messages', 'Terjadi kesalahan saat verifikasi email.');
        res.redirect('/login');
    }
};

exports.getForgotPasswordPage = (req, res) => {
    res.render('auth/forgot_password', { pageTitle: 'Lupa Password' });
};

exports.postForgotPassword = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_messages', errors.array().map(err => err.msg));
        return res.redirect('/forgot-password');
    }
    try {
        const user = await User.findOne({ email: req.body.email.toLowerCase() });
        if (!user) {
            req.flash('success_messages', 'Jika email Anda terdaftar, instruksi reset password akan dikirim.');
            return res.redirect('/forgot-password');
        }

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 jam
        await user.save();

        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${token}`;
        
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || 587),
                secure: (process.env.SMTP_PORT === '465'),
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
                 tls: {
                    rejectUnauthorized: process.env.NODE_ENV === 'production'
                }
            });
            const mailOptions = {
                from: `"${process.env.STORE_NAME}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
                to: user.email,
                subject: `Reset Password Akun ${process.env.STORE_NAME}`,
                html: `<p>Anda meminta untuk mereset password akun ${process.env.STORE_NAME} Anda.</p>
                       <p>Silakan klik link berikut untuk mereset password Anda:</p>
                       <p><a href="${resetUrl}">${resetUrl}</a></p>
                       <p>Jika Anda tidak meminta ini, abaikan email ini.</p>
                       <p>Link ini akan kadaluarsa dalam 1 jam.</p>`,
            };
            await transporter.sendMail(mailOptions);
            req.flash('success_messages', 'Instruksi reset password telah dikirim ke email Anda.');
        } else {
            console.warn('SMTP tidak dikonfigurasi, email reset password tidak dikirim.');
            req.flash('info_messages', 'Fitur reset password via email saat ini tidak aktif. Hubungi admin.');
        }
        res.redirect('/forgot-password');
    } catch (error) {
        console.error('Error forgot password:', error);
        req.flash('error_messages', 'Terjadi kesalahan.');
        res.redirect('/forgot-password');
    }
};

exports.getResetPasswordPage = async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() },
        });
        if (!user) {
            req.flash('error_messages', 'Token reset password tidak valid atau sudah kadaluarsa.');
            return res.redirect('/forgot-password');
        }
        res.render('auth/reset_password', { pageTitle: 'Reset Password Anda', token: req.params.token });
    } catch (error) {
        req.flash('error_messages', 'Terjadi kesalahan.');
        res.redirect('/forgot-password');
    }
};

exports.postResetPassword = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_messages', errors.array().map(err => err.msg));
        return res.redirect(`/reset-password/${req.params.token}`);
    }
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            req.flash('error_messages', 'Token reset password tidak valid atau sudah kadaluarsa.');
            return res.redirect('/forgot-password');
        }

        if (req.body.password !== req.body.confirmPassword) {
            req.flash('error_messages', 'Password dan konfirmasi password tidak cocok.');
            return res.redirect(`/reset-password/${req.params.token}`);
        }
        
        user.password = req.body.password; // Hashing akan dilakukan oleh pre-save hook di model User
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        if (!user.isVerified) { 
            user.isVerified = true; // Verifikasi otomatis saat reset password berhasil
        }
        await user.save();

        req.flash('success_messages', 'Password berhasil direset. Silakan login dengan password baru Anda.');
        res.redirect('/login');
    } catch (error) {
        console.error('Error reset password:', error);
        req.flash('error_messages', 'Gagal mereset password.');
        res.redirect(`/reset-password/${req.params.token}`);
    }
};