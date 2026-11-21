import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import BASE_URL from "../config";

const TempUserLoading = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ran = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    console.log("✅ TempUserLoading mounted");

    const tempToken = searchParams.get("token");
    console.log("🔑 token from URL:", tempToken);

    if (!tempToken) {
      setError("This link has no pass in it. Ask the security guard for a new QR code.");
      return;
    }

    const run = async () => {
      try {
        console.log("📡 Calling templogin API...");
        const res = await axios.post(
          `${BASE_URL}/adduser/templogin`,
          {},
          { headers: { Authorization: `Bearer ${tempToken}` } }
        );

        console.log("✅ API success:", res.data);

        localStorage.setItem("token", res.data.token);
        console.log("💾 Token stored in localStorage");

        console.log("➡️ Navigating to /tempuserhome");
        navigate("/tempuserhome", { replace: true });
      } catch (err) {
        const status = err.response?.status;
        if (status === 409) setError(err.response.data.error || "This QR code was already used.");
        else if (status === 401) setError("This QR code has expired (passes are valid for 5 minutes). Ask the guard for a new one.");
        else setError("Couldn't reach the server. Check your internet and scan again.");
      }
    };

    run();
  }, [navigate, searchParams]);

  return (
    <div style={{ padding: 24, textAlign: "center", fontFamily: "sans-serif" }}>
      {error ? (
        <>
          <h2>Pass not activated</h2>
          <p>{error}</p>
        </>
      ) : (
        <h2>Activating your pass…</h2>
      )}
    </div>
  );
};

export default TempUserLoading;
