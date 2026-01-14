package com.groupbuy.app;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.List;

public class ProductAdapter extends RecyclerView.Adapter<ProductAdapter.ViewHolder> {
    
    private List<LoginActivity.Product> products;
    private OnProductClickListener listener;
    
    public interface OnProductClickListener {
        void onProductClick(LoginActivity.Product product);
    }
    
    public ProductAdapter(List<LoginActivity.Product> products, OnProductClickListener listener) {
        this.products = products;
        this.listener = listener;
    }
    
    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_product, parent, false);
        return new ViewHolder(view);
    }
    
    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        LoginActivity.Product product = products.get(position);
        holder.productName.setText(product.name);
        holder.itemView.setOnClickListener(v -> {
            if (listener != null) {
                listener.onProductClick(product);
            }
        });
    }
    
    @Override
    public int getItemCount() {
        return products.size();
    }
    
    public static class ViewHolder extends RecyclerView.ViewHolder {
        TextView productName;
        
        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            productName = itemView.findViewById(R.id.productName);
        }
    }
}
