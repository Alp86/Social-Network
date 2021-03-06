const { app } = require('../index');
const { hash, compare } = require('../libs/bcrypt');
const { sendEmail } = require("../aws/ses");
const cryptoRandomString = require('crypto-random-string');
const {
    insertUser, getUserByEmail, insertCode, getCode, updatePw
} = require('../libs/db');

app.post("/registration", async (req, res) => {

    const {first, last, email, password} = req.body;
    try {
        const hashedPw = await hash(password);
        const { rows } = await insertUser(first, last, email, hashedPw);
        req.session.user = {
            id: rows[0].id
        };
        res.json({success: true});
    } catch (error) {
        console.log("error in POST /registration", error.message);
        if (error.message == 'duplicate key value violates unique constraint "users_email_key"') {
            res.json({error: "email address is already registered"});
        }
    }
});

app.post("/login", async (req, res) => {

    const { email, password } = req.body;
    const { rows } = await getUserByEmail(email);

    if (!rows[0]) {
        // no such user
        res.json({error: "user doesn't exist"});
    } else {
        // user exists
        const pass = await compare(password, rows[0].password);
        if (pass) {
            // correct password
            // login successfull
            req.session.user = {
                id: rows[0].id
            };

            res.json({success: true});
        } else {
            // wrong password
            res.json({error: "wrong password"});
        }
    }
});

app.post("/password/reset/start", (req, res) => {
    const { email } = req.body;

    getUserByEmail(email)
        .then( ({rows}) => {
            if (rows[0]) {
                // user exists
                // generate secret code
                const secretCode = cryptoRandomString({
                    length: 6
                });
                // insert code into db
                insertCode(secretCode, email)
                    .then(() => {
                        // send email
                        sendEmail(email, "Verify password reset", secretCode);

                        res.json({success: true});
                    })
                    .catch(error => console.log("error in insertCode:", error));
            } else {
                // user does not exist
                res.json({
                    error: "user does not exist"
                });
            }
        })
        .catch(error => console.log("error in selectUser:", error));
});

app.post("/password/reset/verify", (req, res) => {
    const { email, code, password } = req.body.data;
    // console.log("verify req.body.data:", req.body.data);
    // res.sendStatus(200);
    // db query to get code by email
    getCode(email)
        .then( ({rows}) => {
            if (rows[0]) {
                if (code === rows[0].code) {
                    // hash new password
                    hash(password)
                        .then(hashedPw => {
                            // update password
                            updatePw(email, hashedPw)
                                .then(() => {
                                    // send success message
                                    res.json({
                                        success: true
                                    });
                                })
                                .catch(error => console.log("error in updatePw:", error));
                        })
                        .catch(error => console.log("error in hash:", error));

                } else {
                    // inserted wrong code
                    res.json({
                        error: "wrong code"
                    });
                }
            } else {
                // code expired
                res.json({
                    error: "code expired"
                });
            }
        })
        .catch(error => console.log("error in getCode:", error));
});

app.get("/logout", (req, res) => {
    delete req.session.user;
    res.redirect("/welcome#/login");
});
