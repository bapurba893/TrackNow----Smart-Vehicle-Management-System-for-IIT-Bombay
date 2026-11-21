import { useEffect, useState } from "react";
import "./style2/SecurityAddUser.css";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import BASE_URL from "../config";
import { QRCodeCanvas } from "qrcode.react";
import PlateScanner from "../ocr/PlateScanner";
import { isValidPlate } from "../ocr/plateParser";

const PASS_VALID_SECONDS = 300; // must match the QR token expiry on the server


const TempUserAdd = () => {
  const navigate = useNavigate();
  const [showPopup, setShowPopup] = useState(false);
  const [timeLeft, setTimeLeft] = useState(PASS_VALID_SECONDS);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    platenumber: "",
    allottedTime: "",
    type:"private"
  }); 
  const [token, setToken] = useState("");


  useEffect(() => {
    if (!showPopup || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [showPopup, timeLeft]);

  const formatTime = (sec) => {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

   const handleChange = (e) => {
      const { name, value } = e.target;

      setFormData({
        ...formData,
        [name]: name === "platenumber" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : value
      });
   };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!isValidPlate(formData.platenumber)) {
      setError("Plate must look like MH01AB1234");
      return;
    }
    const token = localStorage.getItem("token");
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    try {
      const redRes = await axios.get(`${BASE_URL}/adduser/checkredlist`, {
        ...auth,
        params: { plate: formData.platenumber },
      });

      if (redRes.data.isRed) {
        const allow = window.confirm(
          `⚠️ ${formData.platenumber} is on the RED LIST (overstayed ${redRes.data.count} time(s) before). Allow entry?`
        );
        if (!allow) {
          setFormData({ platenumber: "", allottedTime: "", type: "private" });
          return;
        }
      }

      const response = await axios.post(
        `${BASE_URL}/adduser/tempadd`,
        { plate: formData.platenumber, type: formData.type, minutes: Number(formData.allottedTime) },
        auth
      );

      setToken(response.data.token);
      setTimeLeft(PASS_VALID_SECONDS);
      setShowPopup(true);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        alert("Your session has expired. Please log in again.");
        localStorage.clear();
        navigate("/securitylogin");
      } else {
        setError(err.response?.data?.error || "Could not create the pass. Check your connection.");
      }
    }
  };

  const handleLogout = () =>{
      localStorage.clear();
  };

  return (
    <div className="temp-add-page">
      {/* ===== NAVBAR ===== */}
      <nav className="navbar">
        <h2 className="nav-left">Temp User</h2>
        <div className="nav-center">
          <Link to="/adduser"><span className="nav-text active">Add</span></Link>
          <Link to="/manageuser"><span className="nav-text">Manage</span></Link>
          <Link to="/securitymap"><span className="nav-text">Map</span></Link>
        </div>

       <Link to="/securitylogin"> <button onClick={handleLogout} className="logout-btn">Logout</button> </Link>
      </nav>

      {/* ===== CONTENT ===== */}
      <main className="content">
        <h1 className="title">Add Temporary User</h1>

        <PlateScanner
          onDetected={(plate) => setFormData((f) => ({ ...f, platenumber: plate }))}
        />

        <form className="login-form" onSubmit={handleSubmit}>
          <input
            type="text"
            name="platenumber"
            placeholder="Plate number (e.g. MH01AB1234)"
            required
            autoComplete="off"
            value={formData.platenumber}
            onChange={handleChange}
          />

          <select
            name="type"
            required
            value={formData.type}
            onChange={handleChange}
          >
            <option value="private">Private</option>
            <option value="auto">Auto</option>
            <option value="cab">Cab</option>
            <option value="bus">Bus</option>
            <option value="delivery">Delivery</option>
            <option value="construction">Construction</option>
            <option value="other">Other</option>
          </select>

          <input
            type="number"
            name="allottedTime"
            placeholder="Time (in minutes)"
            min="1"
            max="1440"
            required
            value={formData.allottedTime}
            onChange={handleChange}
          />

          

          {error && <p className="form-error">{error}</p>}

          <button className="submit-btn">Generate Pass</button>
        </form>
      </main>

      {/* ===== POPUP ===== */}
      {showPopup && (
        <div className="popup-overlay">
          <div className="popup">
            <h2>Temporary Pass</h2>

            {token && (
              <div className="barcode">
                <QRCodeCanvas
                  value={`${window.location.origin}/tempuserloading?token=${token}`}
                  size={180}
                />

                <p className="qr-link">
                  <a
                    href={`${window.location.origin}/tempuserloading?token=${token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {window.location.origin}/tempuserloading?token={token}
                  </a>
                </p>
              </div>
            )}


            <p className="timer">
              Valid for: <strong>{formatTime(timeLeft)}</strong>
            </p>

            {timeLeft <= 0 && (
              <p className="expired">Pass Expired</p>
            )}

            <button
              className="submit-btn"
              onClick={() => {
                setShowPopup(false);
                setTimeLeft(PASS_VALID_SECONDS);
                setToken("");
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TempUserAdd;
