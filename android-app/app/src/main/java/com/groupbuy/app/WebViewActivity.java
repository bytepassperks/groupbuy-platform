package com.groupbuy.app;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;
import android.view.View;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class WebViewActivity extends AppCompatActivity {
    
    private static final String API_BASE_URL = "http://165.22.2.0/api";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    
    // Blocked URL patterns for security
    private static final List<String> BLOCKED_PATTERNS = Arrays.asList(
        "/settings", "/account", "/billing", "/subscription", "/payment",
        "/profile", "/preferences", "/admin", "/manage", "/plan",
        "/upgrade", "/cancel", "/delete-account", "/security",
        "/password", "/email-settings", "/notifications-settings"
    );
    
    private WebView webView;
    private ProgressBar progressBar;
    private OkHttpClient client = new OkHttpClient();
    
    private String accessCode;
    private int productId;
    private String productName;
    private String loginUrl;
    
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_webview);
        
        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        
        // Get intent extras
        accessCode = getIntent().getStringExtra("accessCode");
        productId = getIntent().getIntExtra("productId", 0);
        productName = getIntent().getStringExtra("productName");
        loginUrl = getIntent().getStringExtra("loginUrl");
        
        setTitle(productName);
        
        // Configure WebView for security
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        
        // Disable debugging/DevTools
        WebView.setWebContentsDebuggingEnabled(false);
        
        webView.setWebViewClient(new SecureWebViewClient());
        
        // Fetch session cookies and load the page
        fetchSessionCookies();
    }
    
    private void fetchSessionCookies() {
        progressBar.setVisibility(View.VISIBLE);
        
        JSONObject json = new JSONObject();
        try {
            json.put("accessCode", accessCode);
            json.put("productId", productId);
            json.put("deviceFingerprint", "android-" + android.os.Build.MODEL);
        } catch (Exception e) {
            showError("Error creating request");
            return;
        }
        
        RequestBody body = RequestBody.create(json.toString(), JSON);
        Request request = new Request.Builder()
                .url(API_BASE_URL + "/extension/get-credentials")
                .post(body)
                .build();
        
        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    showError("Failed to connect to server");
                });
            }
            
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String responseBody = response.body().string();
                runOnUiThread(() -> {
                    try {
                        JSONObject result = new JSONObject(responseBody);
                        if (result.optBoolean("success", false)) {
                            JSONArray cookies = result.optJSONArray("sessionCookies");
                            String serviceUrl = result.optString("serviceUrl", loginUrl);
                            
                            if (cookies != null && cookies.length() > 0) {
                                injectCookiesAndLoad(cookies, serviceUrl);
                            } else {
                                progressBar.setVisibility(View.GONE);
                                showError("No session cookies available");
                            }
                        } else {
                            progressBar.setVisibility(View.GONE);
                            showError(result.optString("error", "Failed to get session"));
                        }
                    } catch (Exception e) {
                        progressBar.setVisibility(View.GONE);
                        showError("Error parsing response: " + e.getMessage());
                    }
                });
            }
        });
    }
    
    private void injectCookiesAndLoad(JSONArray cookies, String url) {
        try {
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);
            
            // Extract domain from URL
            String domain = extractDomain(url);
            
            for (int i = 0; i < cookies.length(); i++) {
                JSONObject cookie = cookies.getJSONObject(i);
                String name = cookie.optString("name");
                String value = cookie.optString("value");
                String cookieDomain = cookie.optString("domain", domain);
                String path = cookie.optString("path", "/");
                boolean secure = cookie.optBoolean("secure", false);
                boolean httpOnly = cookie.optBoolean("httpOnly", false);
                
                StringBuilder cookieString = new StringBuilder();
                cookieString.append(name).append("=").append(value);
                cookieString.append("; domain=").append(cookieDomain);
                cookieString.append("; path=").append(path);
                if (secure) cookieString.append("; secure");
                if (httpOnly) cookieString.append("; httponly");
                
                String cookieUrl = (secure ? "https://" : "http://") + cookieDomain.replaceFirst("^\\.", "");
                cookieManager.setCookie(cookieUrl, cookieString.toString());
            }
            
            cookieManager.flush();
            
            // Load the URL after cookies are set
            progressBar.setVisibility(View.GONE);
            webView.loadUrl(url);
            
        } catch (Exception e) {
            progressBar.setVisibility(View.GONE);
            showError("Error injecting cookies: " + e.getMessage());
        }
    }
    
    private String extractDomain(String url) {
        try {
            java.net.URL parsedUrl = new java.net.URL(url);
            return parsedUrl.getHost();
        } catch (Exception e) {
            return "";
        }
    }
    
    private boolean isBlockedUrl(String url) {
        String lowerUrl = url.toLowerCase();
        for (String pattern : BLOCKED_PATTERNS) {
            if (lowerUrl.contains(pattern)) {
                return true;
            }
        }
        return false;
    }
    
    private void showBlockedPage() {
        new AlertDialog.Builder(this)
            .setTitle("Access Restricted")
            .setMessage("This page is restricted for security reasons. Settings, billing, and account pages are not accessible.")
            .setPositiveButton("Go Back", (dialog, which) -> {
                if (webView.canGoBack()) {
                    webView.goBack();
                }
            })
            .setCancelable(false)
            .show();
    }
    
    private void showError(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
    
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
    
    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Clear cookies when activity is destroyed (logout)
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.removeAllCookies(null);
        cookieManager.flush();
    }
    
    private class SecureWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            
            // Block restricted URLs
            if (isBlockedUrl(url)) {
                showBlockedPage();
                return true;
            }
            
            return false;
        }
        
        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            progressBar.setVisibility(View.GONE);
        }
    }
}
