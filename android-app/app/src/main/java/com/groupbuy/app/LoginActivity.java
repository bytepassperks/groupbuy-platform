package com.groupbuy.app;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class LoginActivity extends AppCompatActivity {
    
    private static final String API_BASE_URL = "http://165.22.2.0/api";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    
    private EditText accessCodeInput;
    private Button verifyButton;
    private ProgressBar progressBar;
    private TextView errorText;
    private RecyclerView productsRecyclerView;
    private View loginCard;
    private View productsCard;
    private TextView welcomeText;
    
    private OkHttpClient client = new OkHttpClient();
    private String currentAccessCode;
    private List<Product> products = new ArrayList<>();
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);
        
        accessCodeInput = findViewById(R.id.accessCodeInput);
        verifyButton = findViewById(R.id.verifyButton);
        progressBar = findViewById(R.id.progressBar);
        errorText = findViewById(R.id.errorText);
        productsRecyclerView = findViewById(R.id.productsRecyclerView);
        loginCard = findViewById(R.id.loginCard);
        productsCard = findViewById(R.id.productsCard);
        welcomeText = findViewById(R.id.welcomeText);
        
        productsRecyclerView.setLayoutManager(new LinearLayoutManager(this));
        
        verifyButton.setOnClickListener(v -> verifyAccessCode());
    }
    
    private void verifyAccessCode() {
        String accessCode = accessCodeInput.getText().toString().trim();
        if (accessCode.isEmpty()) {
            showError("Please enter your access code");
            return;
        }
        
        currentAccessCode = accessCode;
        showLoading(true);
        hideError();
        
        JSONObject json = new JSONObject();
        try {
            json.put("accessCode", accessCode);
        } catch (Exception e) {
            showError("Error creating request");
            return;
        }
        
        RequestBody body = RequestBody.create(json.toString(), JSON);
        Request request = new Request.Builder()
                .url(API_BASE_URL + "/extension/verify-code")
                .post(body)
                .build();
        
        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    showLoading(false);
                    showError("Failed to connect to server");
                });
            }
            
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String responseBody = response.body().string();
                runOnUiThread(() -> {
                    showLoading(false);
                    try {
                        JSONObject result = new JSONObject(responseBody);
                        if (result.optBoolean("success", false)) {
                            JSONArray subscriptions = result.optJSONArray("subscriptions");
                            if (subscriptions != null && subscriptions.length() > 0) {
                                products.clear();
                                for (int i = 0; i < subscriptions.length(); i++) {
                                    JSONObject sub = subscriptions.getJSONObject(i);
                                    Product product = new Product();
                                    product.id = sub.optInt("product_id");
                                    product.name = sub.optString("product_name", "Unknown");
                                    product.loginUrl = sub.optString("login_url", "");
                                    product.iconUrl = sub.optString("icon_url", "");
                                    products.add(product);
                                }
                                showProducts();
                            } else {
                                showError("No active subscriptions found");
                            }
                        } else {
                            showError(result.optString("error", "Invalid access code"));
                        }
                    } catch (Exception e) {
                        showError("Error parsing response");
                    }
                });
            }
        });
    }
    
    private void showProducts() {
        loginCard.setVisibility(View.GONE);
        productsCard.setVisibility(View.VISIBLE);
        welcomeText.setText("Select a product to access:");
        
        ProductAdapter adapter = new ProductAdapter(products, product -> {
            launchProduct(product);
        });
        productsRecyclerView.setAdapter(adapter);
    }
    
    private void launchProduct(Product product) {
        Intent intent = new Intent(this, WebViewActivity.class);
        intent.putExtra("accessCode", currentAccessCode);
        intent.putExtra("productId", product.id);
        intent.putExtra("productName", product.name);
        intent.putExtra("loginUrl", product.loginUrl);
        startActivity(intent);
    }
    
    private void showLoading(boolean show) {
        progressBar.setVisibility(show ? View.VISIBLE : View.GONE);
        verifyButton.setEnabled(!show);
    }
    
    private void showError(String message) {
        errorText.setText(message);
        errorText.setVisibility(View.VISIBLE);
    }
    
    private void hideError() {
        errorText.setVisibility(View.GONE);
    }
    
    public static class Product {
        public int id;
        public String name;
        public String loginUrl;
        public String iconUrl;
    }
}
